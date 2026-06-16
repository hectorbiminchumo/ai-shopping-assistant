import { EmbeddingError } from "../../../src/errors"
import { EmbeddingService } from "../../../src/pipeline/EmbeddingService"

describe("EmbeddingService", () => {
  it("throws until the Voyage AI client is configured", async () => {
    const service = new EmbeddingService()
    await expect(service.embedText("running shoes")).rejects.toThrow(EmbeddingError)
  })
})
