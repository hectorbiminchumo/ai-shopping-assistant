import { EmbeddingError } from "../../../src/errors"
import { EmbeddingService } from "../../../src/pipeline/EmbeddingService"

const mockEmbed = jest.fn()

jest.mock("../../../src/config", () => ({
  aiConfig: { voyageModel: "voyage-3" },
  getVoyageClient: () => ({ embed: mockEmbed }),
}))

describe("EmbeddingService", () => {
  let service: EmbeddingService

  beforeEach(() => {
    mockEmbed.mockReset()
    service = new EmbeddingService()
  })

  // ── embedText ──────────────────────────────────────────────────────────────

  it("embedText() returns the embedding vector from Voyage AI", async () => {
    const vector = [0.1, 0.2, 0.3]
    mockEmbed.mockResolvedValue({ data: [{ embedding: vector }] })

    const result = await service.embedText("running shoes")

    expect(result).toEqual(vector)
    expect(mockEmbed).toHaveBeenCalledWith({ input: ["running shoes"], model: "voyage-3" })
  })

  it("embedText() throws EmbeddingError when the response contains no embedding", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: null }] })

    await expect(service.embedText("running shoes")).rejects.toThrow(EmbeddingError)
    await expect(service.embedText("running shoes")).rejects.toThrow("Empty embedding response")
  })

  it("embedText() wraps a network / API error in EmbeddingError", async () => {
    mockEmbed.mockRejectedValue(new Error("Request timeout"))

    await expect(service.embedText("running shoes")).rejects.toThrow(EmbeddingError)
    await expect(service.embedText("running shoes")).rejects.toThrow("Failed to generate embedding")
  })

  it("embedText() does not double-wrap an EmbeddingError", async () => {
    const original = new EmbeddingError("already wrapped")
    mockEmbed.mockRejectedValue(original)

    await expect(service.embedText("shoes")).rejects.toThrow("already wrapped")
  })

  // ── embedBatch ─────────────────────────────────────────────────────────────

  it("embedBatch() returns embeddings for all input texts", async () => {
    const vectors = [[0.1, 0.2], [0.3, 0.4]]
    mockEmbed.mockResolvedValue({ data: [{ embedding: vectors[0] }, { embedding: vectors[1] }] })

    const result = await service.embedBatch(["shoes", "jacket"])

    expect(result).toEqual(vectors)
    expect(mockEmbed).toHaveBeenCalledWith({ input: ["shoes", "jacket"], model: "voyage-3" })
  })

  it("embedBatch() throws EmbeddingError when the response has no data", async () => {
    mockEmbed.mockResolvedValue({ data: null })

    await expect(service.embedBatch(["shoes"])).rejects.toThrow(EmbeddingError)
    await expect(service.embedBatch(["shoes"])).rejects.toThrow("Empty batch response")
  })

  it("embedBatch() wraps a network / API error in EmbeddingError", async () => {
    mockEmbed.mockRejectedValue(new Error("Connection refused"))

    await expect(service.embedBatch(["shoes"])).rejects.toThrow(EmbeddingError)
    await expect(service.embedBatch(["shoes"])).rejects.toThrow("Failed to generate batch embeddings")
  })
})
