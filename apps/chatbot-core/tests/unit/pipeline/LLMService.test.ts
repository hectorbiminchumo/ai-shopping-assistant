import { LLMService } from "../../../src/pipeline/LLMService"
import { LLMError } from "../../../src/errors"
import type { RetrievalResult } from "../../../src/types"
import OpenAI from "openai"

const mockCreate = jest.fn()

jest.mock("../../../src/config", () => ({
  aiConfig: { openaiModel: "gpt-4o-mini" },
  getOpenAiClient: () => ({
    chat: { completions: { create: mockCreate } },
  }),
}))

function makeResult(title: string, price: number, score = 0.75): RetrievalResult {
  return {
    product: {
      id: "prod_1",
      medusaProductId: "medusa_1",
      title,
      description: "A great product.",
      tags: [],
      variants: [{ id: "var_1", title: "M", sku: "SKU-1", price, inventoryQuantity: 10, options: {} }],
    },
    similarityScore: score,
  }
}

describe("LLMService", () => {
  let service: LLMService

  beforeEach(() => {
    mockCreate.mockReset()
    service = new LLMService()
  })

  it("complete() returns the LLM message content", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Try the Trail Runner X." } }],
    })

    const result = await service.complete("User: running shoes under $100")

    expect(result).toBe("Try the Trail Runner X.")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" })
    )
  })

  it("generateResponse() builds prompt from query + products and returns LLM reply", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "I recommend the Trail Runner X." } }],
    })

    const result = await service.generateResponse(
      "I need trail running shoes",
      [makeResult("Trail Runner X", 89)]
    )

    expect(result).toBe("I recommend the Trail Runner X.")
    const calledMessages = mockCreate.mock.calls[0][0].messages as { role: string; content: string }[]
    const userMessage = calledMessages.find((m) => m.role === "user")
    expect(userMessage?.content).toContain("Trail Runner X")
    expect(userMessage?.content).toContain("I need trail running shoes")
  })

  it("throws LLMError with rate-limit message on 429", async () => {
    const fakeHeaders = { get: () => null }
    const rateLimitError = new OpenAI.APIError(429, {}, "Too Many Requests", fakeHeaders as never)
    mockCreate.mockRejectedValue(rateLimitError)

    await expect(service.complete("query")).rejects.toThrow(LLMError)
    await expect(service.complete("query")).rejects.toThrow("rate limit")
  })

  it("throws LLMError with auth message on 401", async () => {
    const fakeHeaders = { get: () => null }
    const authError = new OpenAI.APIError(401, {}, "Unauthorized", fakeHeaders as never)
    mockCreate.mockRejectedValue(authError)

    await expect(service.complete("query")).rejects.toThrow(LLMError)
    await expect(service.complete("query")).rejects.toThrow("API key")
  })

  it("throws LLMError for unexpected non-API errors (e.g. network failure)", async () => {
    mockCreate.mockRejectedValue(new Error("Network failure"))

    await expect(service.complete("query")).rejects.toThrow(LLMError)
    await expect(service.complete("query")).rejects.toThrow("Unexpected error")
  })

  it("condenseQuery() falls back to the raw query when the LLM call fails", async () => {
    mockCreate.mockRejectedValue(new Error("Network failure"))

    const result = await service.condenseQuery("for women", [
      { role: "user", content: "gym shoes" },
    ])

    expect(result).toBe("for women")
  })

  it("condenseQuery() returns the raw query unchanged when history is empty", async () => {
    const result = await service.condenseQuery("trail shoes size 42", [])

    expect(result).toBe("trail shoes size 42")
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
