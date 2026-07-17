import { aiConfig } from "../../../src/config"
import { EmbeddingError } from "../../../src/errors"
import { ImageEmbeddingService } from "../../../src/image/ImageEmbeddingService"

// Minimal valid magic-byte headers so detectMimeType passes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const UNKNOWN = Buffer.from([0x00, 0x01, 0x02, 0x03])

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}

describe("ImageEmbeddingService", () => {
  const service = new ImageEmbeddingService()
  const originalKey = aiConfig.voyageApiKey

  beforeEach(() => {
    aiConfig.voyageApiKey = "test-key"
  })
  afterEach(() => {
    aiConfig.voyageApiKey = originalKey
    jest.restoreAllMocks()
  })

  it("returns the 512d embedding from the Voyage multimodal API", async () => {
    const vector = Array.from({ length: 512 }, (_, i) => i / 512)
    mockFetchOnce({ data: [{ embedding: vector }] })

    const result = await service.embedImage(JPEG)

    expect(result).toHaveLength(512)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/multimodalembeddings"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("sends the image as a base64 data URL with the detected mime type", async () => {
    mockFetchOnce({ data: [{ embedding: Array(512).fill(0) }] })

    await service.embedImage(PNG)

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.model).toBe("voyage-multimodal-3.5")
    expect(body.output_dimension).toBe(512)
    expect(body.inputs[0].content[0].image_base64).toMatch(/^data:image\/png;base64,/)
  })

  it("rejects an unsupported image format before calling the API", async () => {
    mockFetchOnce({ data: [{ embedding: Array(512).fill(0) }] })

    await expect(service.embedImage(UNKNOWN)).rejects.toThrow(EmbeddingError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("throws when the API returns a non-2xx response", async () => {
    mockFetchOnce({ error: "bad request" }, false, 400)

    await expect(service.embedImage(JPEG)).rejects.toThrow(EmbeddingError)
  })

  it("throws when the embedding dimension is not 512", async () => {
    mockFetchOnce({ data: [{ embedding: Array(1024).fill(0) }] })

    await expect(service.embedImage(JPEG)).rejects.toThrow(/dimension/i)
  })

  it("throws when VOYAGE_API_KEY is missing", async () => {
    aiConfig.voyageApiKey = ""
    await expect(service.embedImage(JPEG)).rejects.toThrow(EmbeddingError)
  })
})
