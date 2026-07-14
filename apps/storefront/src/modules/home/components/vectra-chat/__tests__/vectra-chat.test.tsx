import { render, screen, fireEvent, act } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"
import { chatStream } from "@lib/api"
import VectraChat from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/us",
}))

jest.mock("@lib/api", () => ({
  chatStream: jest.fn(),
}))

// VectraChat renders results with the shared ProductCard (same card as the
// category pages). Its cart/price internals are covered by its own tests.
jest.mock("@modules/products/components/product-card", () => ({
  __esModule: true,
  default: ({ product }: { product: HttpTypes.StoreProduct }) => (
    <div data-testid="product-card">{product.title}</div>
  ),
}))

const chatStreamMock = chatStream as jest.Mock

// jsdom does not implement element scrolling; the chat panel autoscrolls on mount.
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
    chatStreamMock.mockReset()
  })

  it("shows the assistant message and products joined against the catalog", async () => {
    chatStreamMock.mockResolvedValue({
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
    expect(chatStreamMock).toHaveBeenCalledWith(
      "trail running shoes",
      expect.any(String),
      expect.any(Array),
      expect.any(Function)
    )
  })

  it("shows the assistant message without product cards when hasResults is false", async () => {
    chatStreamMock.mockResolvedValue({
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
    chatStreamMock.mockResolvedValue({
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
    chatStreamMock.mockResolvedValue({ message: "", products: [], hasResults: false })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("submarine")

    expect(
      await screen.findByText(/couldn't find a close match/i)
    ).toBeInTheDocument()
  })

  it("shows the typing indicator while the request is in flight", async () => {
    let resolveChat!: (value: unknown) => void
    chatStreamMock.mockImplementation(
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

  it("updates the bot message incrementally as deltas arrive, then replaces it with the final formatted message", async () => {
    let onDeltaCallback!: (text: string) => void
    let resolveStream!: (value: unknown) => void
    chatStreamMock.mockImplementation(
      (_q: string, _s: string, _h: unknown[], onDelta: (text: string) => void) =>
        new Promise((resolve) => {
          onDeltaCallback = onDelta
          resolveStream = resolve
        })
    )

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(screen.getByText("Vectra is typing")).toBeInTheDocument()

    act(() => onDeltaCallback("Trail Run"))
    expect(await screen.findByText("Trail Run")).toBeInTheDocument()

    act(() => onDeltaCallback("ner X is great."))
    expect(await screen.findByText("Trail Runner X is great.")).toBeInTheDocument()

    act(() =>
      resolveStream({
        message: "Trail Runner X is a great fit for trail running.",
        products: [],
        hasResults: false,
      })
    )

    expect(
      await screen.findByText("Trail Runner X is a great fit for trail running.")
    ).toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    chatStreamMock.mockRejectedValue(new Error("boom"))

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(
      await screen.findByText(/something went wrong/i)
    ).toBeInTheDocument()
  })
})
