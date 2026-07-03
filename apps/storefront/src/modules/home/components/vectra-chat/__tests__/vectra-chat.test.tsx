import { render, screen, fireEvent } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"
import { search } from "@lib/api"
import VectraChat from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/us",
}))

jest.mock("@lib/api", () => ({
  search: jest.fn(),
}))

// The chat renders results with the shared ProductCard (same card as the
// category pages). Its cart/price internals are covered by its own tests.
jest.mock("@modules/products/components/product-card", () => ({
  __esModule: true,
  default: ({ product }: { product: HttpTypes.StoreProduct }) => (
    <div data-testid="product-card">{product.title}</div>
  ),
}))

const searchMock = search as jest.Mock

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

describe("VectraChat semantic search", () => {
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
    searchMock.mockReset()
  })

  it("shows products returned by the backend, joined against the catalog", async () => {
    searchMock.mockResolvedValue({
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
      await screen.findByText("I found 1 product that matches your search:")
    ).toBeInTheDocument()
    expect(screen.getByText("Trail Runner X")).toBeInTheDocument()
    expect(searchMock).toHaveBeenCalledWith("trail running shoes")
  })

  it("shows the empty state when the backend finds no close match", async () => {
    searchMock.mockResolvedValue({ products: [], hasResults: false })

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("submarine")

    expect(
      await screen.findByText(/couldn't find a close match/i)
    ).toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    searchMock.mockRejectedValue(new Error("boom"))

    render(<VectraChat products={catalog} />)
    openChat()
    sendQuery("trail running shoes")

    expect(
      await screen.findByText(/something went wrong/i)
    ).toBeInTheDocument()
  })
})
