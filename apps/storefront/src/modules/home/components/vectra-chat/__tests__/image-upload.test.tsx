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

const clickSend = () => fireEvent.click(screen.getByRole("button", { name: "Send" }))

// Attaching stages the file in the composer; the search only runs on send.
function attachAndSend(file: File) {
  dropFile(file)
  clickSend()
}

describe("VectraChat image upload", () => {
  beforeEach(() => {
    searchImageMock.mockReset()
  })

  describe("staging (attach now, send later)", () => {
    it("does not search on drop — the file waits in the composer", async () => {
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(makeFile("shoe.png", "image/png"))

      // Thumbnail is staged in the composer, addressable by its filename
      expect(await screen.findByAltText("shoe.png")).toBeInTheDocument()
      expect(searchImageMock).not.toHaveBeenCalled()
    })

    it("lets the user type after attaching and sends both together", async () => {
      searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(makeFile("shoe.png", "image/png"))
      fireEvent.change(getComposer(), { target: { value: "  in black  " } })
      clickSend()

      await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
      expect(searchImageMock.mock.calls[0][2]).toBe("in black")
      // Composer is cleared and the text rides along as the bubble's caption
      expect(getComposer()).toHaveValue("")
      expect(await screen.findByText("in black")).toBeInTheDocument()
    })

    it("removes a staged attachment without sending it", async () => {
      render(<VectraChat products={catalog} />)
      openChat()
      dropFile(makeFile("shoe.png", "image/png"))

      fireEvent.click(await screen.findByRole("button", { name: "Remove shoe.png" }))

      expect(screen.queryByAltText("shoe.png")).not.toBeInTheDocument()
      expect(global.URL.revokeObjectURL).toHaveBeenCalled()
      clickSend()
      expect(searchImageMock).not.toHaveBeenCalled()
    })

    it("sends every staged image in one submit, sharing the same query", async () => {
      searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(makeFile("a.png", "image/png"))
      dropFile(makeFile("b.png", "image/png"))
      fireEvent.change(getComposer(), { target: { value: "for trail" } })
      clickSend()

      await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(2))
      expect(searchImageMock.mock.calls.map((c) => c[2])).toEqual(["for trail", "for trail"])
    })

    it("clears the staged thumbnails once sent", async () => {
      searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      await waitFor(() => expect(screen.queryByAltText("shoe.png")).not.toBeInTheDocument())
    })

    it("disables send with an empty composer and no attachment", () => {
      render(<VectraChat products={catalog} />)
      openChat()

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    })

    // An image on its own is a valid message — pure visual search
    it("enables send once a file is attached, with no text typed", async () => {
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(makeFile("shoe.png", "image/png"))

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled()
      )
    })
  })

  describe("validation", () => {
    it.each([
      ["a non-image file", makeFile("notes.txt", "text/plain"), /only image files are supported/i],
      [
        "a file over 5MB",
        makeFile("huge.png", "image/png", 6 * 1024 * 1024),
        /smaller than 5mb/i,
      ],
      ["an unsupported image type", makeFile("anim.gif", "image/gif"), /only jpg, png or webp/i],
    ])("shows an inline error and never sends %s", async (_label, file, message) => {
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(file)
      clickSend()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(searchImageMock).not.toHaveBeenCalled()
    })

    it("keeps the composer text when the only attachment is rejected", async () => {
      render(<VectraChat products={catalog} />)
      openChat()
      fireEvent.change(getComposer(), { target: { value: "in black" } })

      dropFile(makeFile("notes.txt", "text/plain"))

      expect(await screen.findByText(/only image files are supported/i)).toBeInTheDocument()
      expect(searchImageMock).not.toHaveBeenCalled()
      expect(getComposer()).toHaveValue("in black")
    })

    // The valid file must still go through; the rejected one is just dropped
    it("sends the valid files when a rejected one is staged alongside", async () => {
      searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      dropFile(makeFile("notes.txt", "text/plain"))
      dropFile(makeFile("shoe.png", "image/png"))
      clickSend()

      await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
      expect(searchImageMock.mock.calls[0][0].name).toBe("shoe.png")
    })
  })

  describe("search results", () => {
    it("shows a loading skeleton while a valid image is processed", async () => {
      let resolveSearch!: (value: unknown) => void
      searchImageMock.mockImplementation(
        () => new Promise((resolve) => (resolveSearch = resolve))
      )

      render(<VectraChat products={catalog} />)
      openChat()
      attachAndSend(makeFile("shoe.png", "image/png"))

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

      attachAndSend(makeFile("shoe.png", "image/png"))

      const preview = await screen.findByAltText("Uploaded search image")
      expect(preview).toHaveAttribute("src", "blob:mock-object-url")
      expect(global.URL.createObjectURL).toHaveBeenCalled()
    })

    it("searches on the image alone when the composer is empty", async () => {
      searchImageMock.mockResolvedValue({ message: "", products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
      expect(searchImageMock.mock.calls[0][2]).toBeUndefined()
    })

    it("sends the session id alongside the file to the image-search API", async () => {
      searchImageMock.mockResolvedValue({ products: [], hasResults: false })
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      await waitFor(() => expect(searchImageMock).toHaveBeenCalledTimes(1))
      const [, sessionId] = searchImageMock.mock.calls[0]
      expect(typeof sessionId).toBe("string")
      expect(sessionId.length).toBeGreaterThan(0)
    })

    it("renders product cards with the similarity scores from the response", async () => {
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

      attachAndSend(makeFile("shoe.png", "image/png"))

      expect(await screen.findByTestId("product-card")).toHaveTextContent(
        "Trail Runner X — 0.82"
      )
    })

    it("renders the assistant's reply rather than a fixed caption", async () => {
      searchImageMock.mockResolvedValue({
        message: "This trail shoe matches the aggressive lugs in your photo.",
        products: [],
        hasResults: false,
      })
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      expect(
        await screen.findByText("This trail shoe matches the aggressive lugs in your photo.")
      ).toBeInTheDocument()
    })

    it("shows the assistant's explanation but no cards when nothing matches", async () => {
      searchImageMock.mockResolvedValue({
        message: "Nothing in the catalog looks like that jacket.",
        products: [],
        hasResults: false,
      })
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      expect(
        await screen.findByText("Nothing in the catalog looks like that jacket.")
      ).toBeInTheDocument()
      expect(screen.queryByTestId("product-card")).not.toBeInTheDocument()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    // A failure must read as a failure. It used to say "isn't available yet",
    // which made a real 400 (e.g. a missing publishable key) look like an
    // unimplemented feature.
    it("shows an inline error below the image bubble when the API call fails", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {})
      searchImageMock.mockRejectedValue(new Error("Image search failed with status 404"))
      render(<VectraChat products={catalog} />)
      openChat()

      attachAndSend(makeFile("shoe.png", "image/png"))

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /something went wrong searching with this image/i
      )
      expect(screen.queryByText(/isn't available yet/i)).not.toBeInTheDocument()
    })

    it("stages a file picked through click-to-browse", async () => {
      render(<VectraChat products={catalog} />)
      openChat()

      fireEvent.click(screen.getByRole("button", { name: "Attach image" }))
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, { target: { files: [makeFile("shoe.png", "image/png")] } })
      // NOTE: the real regression here — addFiles reading the input's live
      // FileList lazily inside setState, after the component resets the input —
      // can't be reproduced in jsdom, whose FileList isn't live and isn't
      // emptied by the value="" reset. addFiles materialises the list eagerly to
      // prevent it; verified manually in the browser.

      expect(await screen.findByAltText("shoe.png")).toBeInTheDocument()
    })
  })
})
