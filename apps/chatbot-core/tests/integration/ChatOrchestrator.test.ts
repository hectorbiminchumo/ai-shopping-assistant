import { PromptAssembler } from "../../src/pipeline/PromptAssembler"
import { QueryParser } from "../../src/pipeline/QueryParser"
import { Reranker } from "../../src/pipeline/Reranker"
import { ResponseFormatter } from "../../src/pipeline/ResponseFormatter"
import { ChatOrchestrator } from "../../src/orchestrator/ChatOrchestrator"
import type { ChatSession, Product, RetrievalResult } from "../../src/types"
import { createMockLLMService } from "../mocks/openai.mock"
import { createMockChatLogger, createMockRetrievalService } from "../mocks/supabase.mock"
import { createMockEmbeddingService } from "../mocks/voyageai.mock"

const product: Product = {
  id: "prod_1",
  medusaProductId: "medusa_1",
  title: "Trail Runner X",
  description: "A lightweight trail running shoe.",
  tags: ["trail"],
  variants: [{ id: "var_1", title: "42", sku: "TRX-42", price: 90, inventoryQuantity: 5, options: {} }],
}

const retrievalResult: RetrievalResult = { product, similarityScore: 0.82 }

const session: ChatSession = { sessionId: "session_1", history: [] }

describe("ChatOrchestrator (integration, mocked providers)", () => {
  it("runs the full RAG pipeline and returns a formatted response", async () => {
    const embeddingService = createMockEmbeddingService()
    const retrievalService = createMockRetrievalService([retrievalResult])
    const llmService = createMockLLMService("Trail Runner X is a great match.")
    const chatLogger = createMockChatLogger()

    const orchestrator = new ChatOrchestrator(
      new QueryParser(),
      embeddingService,
      retrievalService,
      new Reranker(),
      new PromptAssembler(),
      llmService,
      new ResponseFormatter(),
      chatLogger
    )

    const response = await orchestrator.handle("trail shoes size 42", session)

    expect(embeddingService.embedText).toHaveBeenCalledWith("trail shoes size 42")
    expect(retrievalService.search).toHaveBeenCalled()
    expect(llmService.complete).toHaveBeenCalled()
    expect(chatLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session_1", hasResults: true })
    )

    expect(response.message).toBe("Trail Runner X is a great match.")
    expect(response.products[0].title).toBe("Trail Runner X")
    expect(response.hasResults).toBe(true)
    expect(response.history).toEqual([
      { role: "user", content: "trail shoes size 42" },
      { role: "assistant", content: "Trail Runner X is a great match." },
    ])
  })

  it("returns the updated history trimmed to the last 10 turns", async () => {
    const longHistory = Array.from({ length: 12 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i + 1}`,
    }))

    const orchestrator = new ChatOrchestrator(
      new QueryParser(),
      createMockEmbeddingService(),
      createMockRetrievalService([retrievalResult]),
      new PromptAssembler(),
      createMockLLMService("Sure!"),
      new ResponseFormatter(),
      createMockChatLogger()
    )

    const response = await orchestrator.handle("one more", {
      sessionId: "session_1",
      history: longHistory,
    })

    expect(response.history).toHaveLength(10)
    expect(response.history?.[0]).toEqual({ role: "user", content: "turn 5" })
    expect(response.history?.at(-1)).toEqual({ role: "assistant", content: "Sure!" })
  })

  it("embeds the condensed standalone query for follow-up messages", async () => {
    const embeddingService = createMockEmbeddingService()
    const llmService = createMockLLMService()
    ;(llmService.condenseQuery as jest.Mock).mockResolvedValue("gym shoes for women")

    const orchestrator = new ChatOrchestrator(
      new QueryParser(),
      embeddingService,
      createMockRetrievalService([retrievalResult]),
      new Reranker(),
      new PromptAssembler(),
      llmService,
      new ResponseFormatter(),
      createMockChatLogger()
    )

    const historySession: ChatSession = {
      sessionId: "session_1",
      history: [
        { role: "user", content: "I am looking for gym shoes" },
        { role: "assistant", content: "For men, women or children?" },
      ],
    }

    await orchestrator.handle("for women", historySession)

    expect(llmService.condenseQuery).toHaveBeenCalledWith("for women", historySession.history)
    expect(embeddingService.embedText).toHaveBeenCalledWith("gym shoes for women")
  })

  it("applies a category pre-filter when the query mentions a known catalog category", async () => {
    const retrievalService = createMockRetrievalService([retrievalResult], ["Shoes", "Jackets"])

    const orchestrator = new ChatOrchestrator(
      new QueryParser(),
      createMockEmbeddingService(),
      retrievalService,
      new Reranker(),
      new PromptAssembler(),
      createMockLLMService(),
      new ResponseFormatter(),
      createMockChatLogger()
    )

    await orchestrator.handle("gym shoes for training", session)

    expect(retrievalService.listCategories).toHaveBeenCalled()
    expect(retrievalService.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "Shoes" }),
      expect.anything()
    )
  })

  it("logs hasResults false when nothing meets the similarity threshold", async () => {
    const retrievalService = createMockRetrievalService([{ product, similarityScore: 0.3 }])
    const chatLogger = createMockChatLogger()

    const orchestrator = new ChatOrchestrator(
      new QueryParser(),
      createMockEmbeddingService(),
      retrievalService,
      new Reranker(),
      new PromptAssembler(),
      createMockLLMService(),
      new ResponseFormatter(),
      chatLogger
    )

    const response = await orchestrator.handle("something obscure", session)

    expect(response.hasResults).toBe(false)
    expect(chatLogger.log).toHaveBeenCalledWith(expect.objectContaining({ hasResults: false }))
  })
})
