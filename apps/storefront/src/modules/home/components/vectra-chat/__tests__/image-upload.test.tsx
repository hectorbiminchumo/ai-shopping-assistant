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

  it("shows an inline error below the image bubble when the API call fails", async () => {
    searchImageMock.mockRejectedValue(new Error("Image search failed with status 404"))
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /image search isn't available/i
    )
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

  it("shows nothing extra once a valid search resolves with no results", async () => {
    searchImageMock.mockResolvedValue({ products: [], hasResults: false })
    render(<VectraChat products={catalog} />)
    openChat()

    dropFile(makeFile("shoe.png", "image/png"))

    await waitFor(() =>
      expect(screen.queryByLabelText("Searching…")).not.toBeInTheDocument()
    )
    expect(screen.queryByTestId("product-card")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
