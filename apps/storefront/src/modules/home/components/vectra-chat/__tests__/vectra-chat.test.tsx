import { render, screen, fireEvent } from "@testing-library/react"
import { search } from "@lib/api"
import VectraChat, { ChatProduct } from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock("@lib/api", () => ({
  search: jest.fn(),
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

  it("clears the composer when the panel closes and stays empty on reopen", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "trail running shoes" } })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(getComposer()).toHaveValue("")

    openChat()
    expect(getComposer()).toHaveValue("")
  })

  it("also clears the composer when closed with Escape", () => {
    render(<VectraChat products={[]} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "waterproof jacket" } })

    fireEvent.keyDown(document, { key: "Escape" })

    expect(getComposer()).toHaveValue("")
  })
})

describe("VectraChat semantic search", () => {
  const catalog: ChatProduct[] = [
    {
      id: "prod_1",
      title: "Trail Runner X",
      handle: "trail-runner-x",
      price: "$95",
      thumbnail: null,
      category: "Running",
    },
  ]

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
      await screen.findByText("I found 1 product that match your search:")
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
