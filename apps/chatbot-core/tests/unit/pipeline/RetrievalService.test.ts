import { RetrievalError } from "../../../src/errors"
import { RetrievalService } from "../../../src/pipeline/RetrievalService"

describe("RetrievalService", () => {
  it("throws until the Supabase client is configured", async () => {
    const service = new RetrievalService()
    await expect(service.search([], { rawQuery: "running shoes" }, 5)).rejects.toThrow(
      RetrievalError
    )
  })
})
