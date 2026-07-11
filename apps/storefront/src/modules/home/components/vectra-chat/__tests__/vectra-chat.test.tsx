import { render, screen, fireEvent } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"
import { chat } from "@lib/api"
import VectraChat from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/us",
}))

jest.mock("@lib/api", () => ({
  chat: jest.fn(),
  ChatFiltersError: class ChatFiltersError extends Error {},
}))

// The chat renders results with the shared ProductCard (same card as the
// category pages). Its cart/price internals are covered by its own tests.
jest.mock("@modules/products/components/product-card", () => ({
  __esModule: true,
  default: ({ product }: { product: HttpTypes.StoreProduct }) => (
    <div data-testid="product-card">{product.title}</div>
  ),
}))

const chatMock = chat as jest.Mock

// jsdom does not implement element scrolling; the chat autoscrolls on mount.
beforeAll(() => {
  HTMLElement.prototype.scrollTo = jest.fn()
})

describe("VectraChat composer", () => {
  const openChat = () =>
    fireEvent.click(screen.getByRole("button", { name: "Ask Vectra" }))
  const getComposer = () =>
    screen.getByPlaceholderText("Describe what you're looking for…")

  it("keeps typed text while the panel is open", () => {
    render(<VectraChat products={[]} />)
    openChat()

    fireEvent.change(getComposer(), { target: { value: "trail running shoes" } })

    expect(getComposer()).toHaveValue("trail running shoes")
  })

  it("keeps the composer text when the panel closes and reopens", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "trail running shoes" } })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(getComposer()).toHaveValue("trail running shoes")

    openChat()
    expect(getComposer()).toHaveValue("trail running shoes")
  })

  it("also keeps the composer text when closed with Escape", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "waterproof jacket" } })

    fireEvent.keyDown(document, { key: "Escape" })

    expect(getComposer()).toHaveValue("waterproof jacket")
  })
})

describe("VectraChat conversation", () => {
  const catalog = [
    {
      id: "prod_1",
      title: "Trail Runner X",
      handle: "trail-runner-x",
      thumbnail: null,
      variants: [],
    },
  ] as unknown as HttpTypes.StoreProduct[]

  const openChat = () =>
    fireEvent.click(screen.getByRole("button", { name: "Ask Vectra" }))
  const getComposer = () =>
    screen.getByPlaceholderText("Describe what you're looking for…")
  const sendQuery = (text: string) => {
    fireEvent.change(getComposer(), { target: { value: text } })
    fireEvent.keyDown(getComposer(), { key: "Enter" })
  }

  beforeEach(() => {
    chatMock.mockReset()
  })

  it("shows the assistant message and products joined against the catalog", async () => {
    chatMock.mockResolvedValue({
      message: "The Trail Runner X is a great fit for trail running.",
      products: [
        {
          id: "emb_1",
          medusaProductId: "prod_1",
          title: "Trail Runner X",
          priceMin: 95,
          priceMax: 95,
          similarityScore: 0.72,
        },
      ],
      hasResults: true,
    })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(
      await screen.findByText("The Trail Runner X is a great fit for trail running.")
    ).toBeInTheDocument()
    expect(screen.getByTestId("product-card")).toHaveTextContent("Trail Runner X")
    expect(chatMock).toHaveBeenCalledWith(
      "trail running shoes",
      expect.any(String),
      expect.any(Array),
      undefined
    )
  })

  it("shows the assistant message without product cards when hasResults is false", async () => {
    chatMock.mockResolvedValue({
      message: "Nothing matches that exactly — try a related category like jackets.",
      products: [
        {
          id: "emb_1",
          medusaProductId: "prod_1",
          title: "Trail Runner X",
          priceMin: 95,
          priceMax: 95,
          similarityScore: 0.3,
        },
      ],
      hasResults: false,
    })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("submarine")

    expect(
      await screen.findByText(/nothing matches that exactly/i)
    ).toBeInTheDocument()
    expect(screen.queryByTestId("product-card")).not.toBeInTheDocument()
  })

  it("answers greetings conversationally with the assistant message", async () => {
    chatMock.mockResolvedValue({
      message: "Hi! I'm Vectra. Tell me what you're looking for.",
      products: [],
      hasResults: false,
    })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("Hello")

    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(
      await screen.findByText("Hi! I'm Vectra. Tell me what you're looking for.")
    ).toBeInTheDocument()
  })

  it("falls back to the canned empty state when the message is empty", async () => {
    chatMock.mockResolvedValue({ message: "", products: [], hasResults: false })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("submarine")

    expect(
      await screen.findByText(/couldn't find a close match/i)
    ).toBeInTheDocument()
  })

  it("shows the typing indicator while the request is in flight", async () => {
    let resolveChat!: (value: unknown) => void
    chatMock.mockImplementation(
      () => new Promise((resolve) => (resolveChat = resolve))
    )

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(screen.getByText("Vectra is typing")).toBeInTheDocument()

    resolveChat({ message: "No luck this time.", products: [], hasResults: false })
    await screen.findByText("No luck this time.")

    expect(screen.queryByText("Vectra is typing")).not.toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    chatMock.mockRejectedValue(new Error("boom"))

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(
      await screen.findByText(/something went wrong/i)
    ).toBeInTheDocument()
  })
})

describe("VectraChat filters", () => {
  const catalog = [
    {
      id: "prod_1",
      title: "Trail Runner X",
      handle: "trail-runner-x",
      thumbnail: null,
      variants: [],
      categories: [{ id: "cat_1", name: "running-shoes" }],
      options: [
        {
          id: "opt_1",
          title: "Size",
          values: [{ id: "v_1", value: "42" }, { id: "v_2", value: "43" }],
        },
      ],
    },
    {
      id: "prod_2",
      title: "City Jacket",
      handle: "city-jacket",
      thumbnail: null,
      variants: [],
      categories: [{ id: "cat_2", name: "jackets" }],
      options: [
        {
          id: "opt_2",
          title: "Size",
          values: [{ id: "v_3", value: "M" }],
        },
      ],
    },
  ] as unknown as HttpTypes.StoreProduct[]

  const openChat = () =>
    fireEvent.click(screen.getByRole("button", { name: "Ask Vectra" }))
  const openFilters = () =>
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }))
  const getComposer = () =>
    screen.getByPlaceholderText("Describe what you're looking for…")
  const sendQuery = (text: string) => {
    fireEvent.change(getComposer(), { target: { value: text } })
    fireEvent.keyDown(getComposer(), { key: "Enter" })
  }

  beforeEach(() => {
    chatMock.mockReset()
    chatMock.mockResolvedValue({ message: "ok", products: [], hasResults: false })
  })

  it("lists catalog categories and sizes in the panel dropdowns", () => {
    render(<VectraChat products={catalog} />)
    openChat()
    openFilters()

    expect(screen.getByRole("option", { name: "running-shoes" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "42" })).toBeInTheDocument()
  })

  it("narrows sizes to the selected category and categories to the selected size", () => {
    render(<VectraChat products={catalog} />)
    openChat()
    openFilters()

    fireEvent.change(screen.getByTestId("chat-filter-category"), {
      target: { value: "running-shoes" },
    })
    expect(screen.getByRole("option", { name: "42" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "M" })).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId("chat-filter-category"), {
      target: { value: "" },
    })
    fireEvent.change(screen.getByTestId("chat-filter-size"), {
      target: { value: "M" },
    })
    expect(screen.getByRole("option", { name: "jackets" })).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "running-shoes" })
    ).not.toBeInTheDocument()
  })

  it("sends the active filters with the next message and shows removable tags", async () => {
    render(<VectraChat products={catalog} />)
    openChat()
    openFilters()

    fireEvent.change(screen.getByTestId("chat-filter-category"), {
      target: { value: "running-shoes" },
    })
    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "80" },
    })
    fireEvent.change(screen.getByTestId("chat-filter-size"), {
      target: { value: "42" },
    })

    // Active filters shown as tags under the composer
    expect(screen.getByTestId("chat-filter-tags")).toHaveTextContent("running-shoes")
    expect(screen.getByTestId("chat-filter-tags")).toHaveTextContent("max 80")
    expect(screen.getByTestId("chat-filter-tags")).toHaveTextContent("size 42")

    sendQuery("trail running shoes")
    await screen.findByText("ok")

    expect(chatMock).toHaveBeenCalledWith(
      "trail running shoes",
      expect.any(String),
      expect.any(Array),
      { category: "running-shoes", priceMax: 80, size: "42" }
    )
  })

  it("removes a single filter from its tag and clears all with the reset button", () => {
    render(<VectraChat products={catalog} />)
    openChat()
    openFilters()

    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "80" },
    })
    fireEvent.change(screen.getByTestId("chat-filter-size"), {
      target: { value: "42" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: max 80" }))
    expect(screen.getByTestId("chat-filter-tags")).not.toHaveTextContent("max 80")
    expect(screen.getByTestId("chat-filter-tags")).toHaveTextContent("size 42")

    fireEvent.click(screen.getByTestId("chat-filter-clear"))
    expect(screen.queryByTestId("chat-filter-tags")).not.toBeInTheDocument()
  })

  it("swaps an inverted price range instead of sending it", async () => {
    render(<VectraChat products={catalog} />)
    openChat()
    openFilters()

    fireEvent.change(screen.getByTestId("chat-filter-price-min"), {
      target: { value: "100" },
    })
    fireEvent.change(screen.getByTestId("chat-filter-price-max"), {
      target: { value: "50" },
    })

    sendQuery("shoes")
    await screen.findByText("ok")

    expect(chatMock).toHaveBeenCalledWith(
      "shoes",
      expect.any(String),
      expect.any(Array),
      { priceMin: 50, priceMax: 100 }
    )
  })

  it("shows the filters the backend actually applied on the response", async () => {
    chatMock.mockResolvedValue({
      message: "Here you go",
      products: [],
      hasResults: false,
      appliedFilters: { category: "running-shoes", priceMax: 50 },
    })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("cheap running shoes")

    expect(await screen.findByTestId("chat-applied-filters")).toHaveTextContent(
      "Filters: running-shoes · max 50"
    )
  })
})
