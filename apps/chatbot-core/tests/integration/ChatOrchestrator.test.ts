import { HISTORY_TURNS, PromptAssembler } from "../../src/pipeline/PromptAssembler"
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
      new Reranker(),
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

  describe("explicit filters", () => {
    it("overrides the text-inferred category with the explicit one", async () => {
      const retrievalService = createMockRetrievalService([retrievalResult], ["running-shoes", "jackets"])

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

      await orchestrator.handle("give me some running-shoes please", session, { category: "jackets" })

      expect(retrievalService.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: "jackets" }),
        expect.anything()
      )
    })

    it("overrides the text-inferred price with the explicit one", async () => {
      const retrievalService = createMockRetrievalService([retrievalResult])

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

      await orchestrator.handle("running shoes under $80", session, { priceMax: 150 })

      expect(retrievalService.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ priceMax: 150 }),
        expect.anything()
      )
    })

    it("merges an explicit filter with the fields still inferred from text", async () => {
      const retrievalService = createMockRetrievalService([retrievalResult], ["running-shoes"])

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

      await orchestrator.handle("running-shoes under $80", session, { size: "44" })

      expect(retrievalService.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: "running-shoes", priceMax: 80, size: "44" }),
        expect.anything()
      )
    })

    it("reports the merged filters in response.appliedFilters", async () => {
      const retrievalService = createMockRetrievalService([retrievalResult], ["running-shoes"])

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

      const response = await orchestrator.handle("running-shoes under $80", session, { size: "44" })

      expect(response.appliedFilters).toEqual({
        category: "running-shoes",
        priceMax: 80,
        size: "44",
      })
    })
  })

  describe("conversation history edge cases", () => {
    it("handles an explicit empty history with no errors", async () => {
      const orchestrator = new ChatOrchestrator(
        new QueryParser(),
        createMockEmbeddingService(),
        createMockRetrievalService([retrievalResult]),
        new Reranker(),
        new PromptAssembler(),
        createMockLLMService("Sure!"),
        new ResponseFormatter(),
        createMockChatLogger()
      )

      const response = await orchestrator.handle("hello", { sessionId: "session_1", history: [] })

      expect(response.history).toEqual([
        { role: "user", content: "hello" },
        { role: "assistant", content: "Sure!" },
      ])
    })

    it("trims a very long history (>20 turns) down to HISTORY_TURNS", async () => {
      const longHistory = Array.from({ length: 25 }, (_, i) => ({
        role: "user" as const,
        content: `turn ${i + 1}`,
      }))

      const orchestrator = new ChatOrchestrator(
        new QueryParser(),
        createMockEmbeddingService(),
        createMockRetrievalService([retrievalResult]),
        new Reranker(),
        new PromptAssembler(),
        createMockLLMService("Sure!"),
        new ResponseFormatter(),
        createMockChatLogger()
      )

      const response = await orchestrator.handle("one more", {
        sessionId: "session_1",
        history: longHistory,
      })

      expect(response.history).toHaveLength(HISTORY_TURNS)
      expect(response.history?.[0]).toEqual({ role: "user", content: "turn 18" })
      expect(response.history?.at(-1)).toEqual({ role: "assistant", content: "Sure!" })
    })

    it("trims alternating user/assistant messages by message count, not by pair", async () => {
      // 11 alternating messages ending on "user" (msg 1, 3, 5, 7, 9, 11 are
      // "user"; 2, 4, 6, 8, 10 are "assistant") — an odd count so the trim
      // boundary falls mid-pair, proving a "turn" is one message, not a pair.
      const alternatingHistory = Array.from({ length: 11 }, (_, i) => ({
        role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `msg ${i + 1}`,
      }))

      const orchestrator = new ChatOrchestrator(
        new QueryParser(),
        createMockEmbeddingService(),
        createMockRetrievalService([retrievalResult]),
        new Reranker(),
        new PromptAssembler(),
        createMockLLMService("Sure!"),
        new ResponseFormatter(),
        createMockChatLogger()
      )

      const response = await orchestrator.handle("one more", {
        sessionId: "session_1",
        history: alternatingHistory,
      })

      expect(response.history).toHaveLength(HISTORY_TURNS)
      // The dangling first kept message is an "assistant" reply whose
      // preceding "user" message was trimmed away.
      expect(response.history?.[0]).toEqual({ role: "assistant", content: "msg 4" })
      expect(response.history?.at(-1)).toEqual({ role: "assistant", content: "Sure!" })
    })

    it("passes the full, untrimmed history to condenseQuery even when longer than HISTORY_TURNS", async () => {
      const longHistory = Array.from({ length: 15 }, (_, i) => ({
        role: "user" as const,
        content: `turn ${i + 1}`,
      }))
      const llmService = createMockLLMService()

      const orchestrator = new ChatOrchestrator(
        new QueryParser(),
        createMockEmbeddingService(),
        createMockRetrievalService([retrievalResult]),
        new Reranker(),
        new PromptAssembler(),
        llmService,
        new ResponseFormatter(),
        createMockChatLogger()
      )

      await orchestrator.handle("for women", { sessionId: "session_1", history: longHistory })

      expect(llmService.condenseQuery).toHaveBeenCalledWith("for women", longHistory)
    })
  })
})
