import { aiConfig } from "../../../src/config"
import { EmbeddingError } from "../../../src/errors"
import { ImageEmbeddingService } from "../../../src/image/ImageEmbeddingService"

// Minimal valid magic-byte headers so detectMimeType passes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const UNKNOWN = Buffer.from([0x00, 0x01, 0x02, 0x03])

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

// Queues one fetch response (or rejection) per call, in order — used to
// exercise the retry loop, which needs different results across attempts.
function mockFetchSequence(
  ...responses: Array<{ ok: boolean; status?: number; body: unknown } | Error>
) {
  const fetchMock = jest.fn()
  for (const r of responses) {
    if (r instanceof Error) {
      fetchMock.mockRejectedValueOnce(r)
    } else {
      fetchMock.mockResolvedValueOnce({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: async () => r.body,
        text: async () => JSON.stringify(r.body),
      })
    }
  }
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
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

  it("rejects an empty image buffer before calling the API", async () => {
    mockFetchOnce({ data: [{ embedding: Array(512).fill(0) }] })

    await expect(service.embedImage(Buffer.alloc(0))).rejects.toThrow("Empty image buffer")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("throws when the API returns a non-2xx response and does not retry a 4xx", async () => {
    const fetchMock = mockFetchOnce({ error: "bad request" }, false, 400)

    await expect(service.embedImage(JPEG)).rejects.toThrow(EmbeddingError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("throws when the embedding dimension is not 512", async () => {
    mockFetchOnce({ data: [{ embedding: Array(1024).fill(0) }] })

    await expect(service.embedImage(JPEG)).rejects.toThrow(/dimension/i)
  })

  it("throws when VOYAGE_API_KEY is missing", async () => {
    aiConfig.voyageApiKey = ""
    await expect(service.embedImage(JPEG)).rejects.toThrow(EmbeddingError)
  })

  it("throws when the API response has no embedding data", async () => {
    mockFetchOnce({ data: [{}] })

    await expect(service.embedImage(JPEG)).rejects.toThrow(
      "Empty embedding response from Voyage multimodal API"
    )
  })

  it("retries a transient failure and returns the embedding on the next attempt", async () => {
    const vector = Array(512).fill(0.5)
    const fetchMock = mockFetchSequence(
      { ok: false, status: 500, body: { error: "server error" } },
      { ok: true, body: { data: [{ embedding: vector }] } }
    )

    const result = await service.embedImage(JPEG)

    expect(result).toEqual(vector)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 10000)

  it("propagates the error after exhausting retries on repeated transient failures", async () => {
    const fetchMock = mockFetchSequence(
      { ok: false, status: 500, body: { error: "1" } },
      { ok: false, status: 500, body: { error: "2" } },
      { ok: false, status: 500, body: { error: "3" } }
    )

    await expect(service.embedImage(JPEG)).rejects.toThrow(EmbeddingError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  }, 10000)

  it("wraps a raw network failure in EmbeddingError", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch

    await expect(service.embedImage(JPEG)).rejects.toThrow("Failed to generate image embedding")
  }, 10000)
})
