import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { HttpTypes } from "@medusajs/types"
import { searchImage } from "@lib/api"
import VectraChat from "../index"

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/us",
}))

jest.mock("@lib/api", () => ({
  chatStream: jest.fn(),
  searchImage: jest.fn(),
  ChatFiltersError: class ChatFiltersError extends Error {},
}))

jest.mock("@modules/products/components/product-card", () => ({
  __esModule: true,
  default: ({
    product,
    matchScore,
  }: {
    product: HttpTypes.StoreProduct
    matchScore?: number
  }) => (
    <div data-testid="product-card">
      {product.title} — {matchScore}
    </div>
  ),
}))

const searchImageMock = searchImage as jest.Mock

beforeAll(() => {
  // jsdom implements neither element scrolling nor object URLs.
  HTMLElement.prototype.scrollTo = jest.fn()
  global.URL.createObjectURL = jest.fn(() => "blob:mock-object-url")
  global.URL.revokeObjectURL = jest.fn()
})

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

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type })
}

function dropFile(file: File) {
  const panel = screen.getByRole("dialog", { name: "Vectra search assistant" })
  const dataTransfer = { types: ["Files"], files: [file] } as unknown as DataTransfer
  fireEvent.dragEnter(panel, { dataTransfer })
  fireEvent.drop(panel, { dataTransfer })
}

describe("VectraChat image upload", () => {
  beforeEach(() => {
    searchImageMock.mockReset()
  })

  it("triggers the file handler on drag & drop", async () => {
    searchImageMock.mockResolvedValue({ products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
  })

  it("shows an inline error and skips the API call for a non-image file", async () => {
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("notes.txt", "text/plain"))

    expect(
      await screen.findByText(/only image files are supported/i)
    ).toBeInTheDocument()
    expect(searchImageMock).not.toHaveBeenCalled()
  })

  it("shows an inline error and skips the API call for a file over 5MB", async () => {
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("huge.png", "image/png", 6 * 1024 * 1024))

    expect(await screen.findByText(/smaller than 5mb/i)).toBeInTheDocument()
    expect(searchImageMock).not.toHaveBeenCalled()
  })

  it("shows a loading skeleton while a valid image is processed", async () => {
    let resolveSearch!: (value: unknown) => void
    searchImageMock.mockImplementation(
      () => new Promise((resolve) => (resolveSearch = resolve))
    )

    render(<VectraChat products={catalog} />)
    openChat()
    dropFile(makeFile("shoe.png", "image/png"))

    expect(await screen.findByLabelText("Searching…")).toBeInTheDocument()

    resolveSearch({ products: [], hasResults: false })
    await waitFor(() =>
      expect(screen.queryByLabelText("Searching…")).not.toBeInTheDocument()
    )
  })

  it("renders the uploaded image preview from a local object URL", async () => {
    searchImageMock.mockResolvedValue({ products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    const preview = await screen.findByAltText("Uploaded search image")
    expect(preview).toHaveAttribute("src", "blob:mock-object-url")
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })

  // A failure must read as a failure. It used to say "isn't available yet",
  // which made a real 400 (e.g. a missing publishable key) look like an
  // unimplemented feature.
  it("shows an inline error below the image bubble when the API call fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    searchImageMock.mockRejectedValue(new Error("Image search failed with status 404"))
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /something went wrong searching with this image/i
    )
    expect(screen.queryByText(/isn't available yet/i)).not.toBeInTheDocument()
  })

  it("renders product cards with the similarity scores from the image search response", async () => {
    searchImageMock.mockResolvedValue({
      products: [
        {
          id: "emb_1",
          medusaProductId: "prod_1",
          title: "Trail Runner X",
          priceMin: 95,
          priceMax: 95,
          similarityScore: 0.82,
        },
      ],
      hasResults: true,
    })

    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    expect(await screen.findByTestId("product-card")).toHaveTextContent(
      "Trail Runner X — 0.82"
    )
  })

  it("shows the assistant's explanation but no cards when the search finds nothing", async () => {
    searchImageMock.mockResolvedValue({
      message: "Nothing in the catalog looks like that jacket.",
      products: [],
      hasResults: false,
    })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    expect(
      await screen.findByText("Nothing in the catalog looks like that jacket.")
    ).toBeInTheDocument()
    expect(screen.queryByTestId("product-card")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("shows an inline error for an image type outside the accepted formats", async () => {
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("anim.gif", "image/gif"))

    expect(
      await screen.findByText(/only jpg, png or webp images are supported/i)
    ).toBeInTheDocument()
    expect(searchImageMock).not.toHaveBeenCalled()
  })

  // Without the query the backend can only do a purely visual search — the
  // 0.6·image + 0.4·text blend never runs.
  it("sends composer text as the query so the search is hybrid", async () => {
    searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "  in black  " } })

    dropFile(makeFile("shoe.png", "image/png"))

    await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
    expect(searchImageMock.mock.calls[0][2]).toBe("in black")
    // Consumed, not left behind to be sent again as a separate text message
    expect(getComposer()).toHaveValue("")
    expect(await screen.findByText("in black")).toBeInTheDocument()
  })

  it("searches on the image alone when the composer is empty", async () => {
    searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
    expect(searchImageMock.mock.calls[0][2]).toBeUndefined()
  })

  it("keeps the composer text when every dropped file is rejected", async () => {
    render(<VectraChat products={catalog} />)
    openChat()
    fireEvent.change(getComposer(), { target: { value: "in black" } })

    dropFile(makeFile("notes.txt", "text/plain"))

    expect(await screen.findByText(/only image files are supported/i)).toBeInTheDocument()
    expect(searchImageMock).not.toHaveBeenCalled()
    expect(getComposer()).toHaveValue("in black")
  })

  it("renders the assistant's reply rather than a fixed caption", async () => {
    searchImageMock.mockResolvedValue({
      message: "This trail shoe matches the aggressive lugs in your photo.",
      products: [
        {
          id: "emb_1",
          medusaProductId: "prod_1",
          title: "Trail Runner X",
          priceMin: 95,
          priceMax: 95,
          similarityScore: 0.82,
        },
      ],
      hasResults: true,
    })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    expect(
      await screen.findByText("This trail shoe matches the aggressive lugs in your photo.")
    ).toBeInTheDocument()
  })

  it("sends the session id alongside the file to the image-search API", async () => {
    searchImageMock.mockResolvedValue({ products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
    const [, sessionId] = searchImageMock.mock.calls[0]
    expect(typeof sessionId).toBe("string")
    expect(sessionId.length).toBeGreaterThan(0)
  })

  it("triggers the file handler via click-to-browse", async () => {
    searchImageMock.mockResolvedValue({ products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    fireEvent.click(screen.getByRole("button", { name: "Attach image" }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile("shoe.png", "image/png")] } })

    await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
  })
})
