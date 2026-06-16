import { EmbeddingError } from "../../../src/errors"
import { ImageEmbeddingService } from "../../../src/image/ImageEmbeddingService"

describe("ImageEmbeddingService", () => {
  it("throws until the CLIP client is configured", async () => {
    const service = new ImageEmbeddingService()
    await expect(service.embedImage(Buffer.from([]))).rejects.toThrow(EmbeddingError)
  })
})
