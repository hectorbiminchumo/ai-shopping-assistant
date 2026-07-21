import type { ImageRetrievalService } from "../../../src/image"
import { ImageOrchestrator } from "../../../src/orchestrator/ImageOrchestrator"
import type { PromptAssembler, QueryParser, ResponseFormatter } from "../../../src/pipeline"
import type { ChatResponse, ChatSession, ParsedQuery, Product, RetrievalResult } from "../../../src/types"
import { createMockImageEmbeddingService } from "../../mocks/clip.mock"
import { createMockLLMService } from "../../mocks/openai.mock"
import {
  createMockChatLogger,
  createMockImageRetrievalService,
  createMockRetrievalService,
} from "../../mocks/supabase.mock"
import { createMockEmbeddingService } from "../../mocks/voyageai.mock"

function product(id: string, title = id): Product {
  return {
    id,
    medusaProductId: `medusa_${id}`,
    title,
    description: "A product.",
    tags: [],
    variants: [],
  }
}

function parsedQuery(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return { rawQuery: "", embeddingText: "", ...overrides }
}

function mockQueryParser(query: ParsedQuery): QueryParser {
  return { parse: jest.fn().mockReturnValue(query) } as unknown as QueryParser
}

function mockPromptAssembler(prompt = "assembled prompt"): PromptAssembler {
  return { assemble: jest.fn().mockReturnValue(prompt) } as unknown as PromptAssembler
}

function mockResponseFormatter(response: ChatResponse): ResponseFormatter {
  return { format: jest.fn().mockReturnValue(response) } as unknown as ResponseFormatter
}

function chatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    message: "Here you go.",
    products: [],
    hasResults: true,
    similarityThresholdMet: true,
    ...overrides,
  }
}

function mockImageRetrievalService(results: RetrievalResult[]): ImageRetrievalService {
  return createMockImageRetrievalService(results) as unknown as ImageRetrievalService
}

const session: ChatSession = { sessionId: "session_1", userId: "user_1", history: [] }

describe("ImageOrchestrator (unit, all dependencies mocked)", () => {
  it("returns the ChatResponse produced by responseFormatter.format, unchanged", async () => {
    const formatted = chatResponse({
      products: [{ id: "p1", medusaProductId: "medusa_p1", title: "Sneaker", similarityScore: 0.8 }],
    })

    const orchestrator = new ImageOrchestrator(
      mockQueryParser(parsedQuery({ rawQuery: "sneakers", embeddingText: "sneakers" })),
      createMockImageEmbeddingService(),
      mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.8 }]),
      createMockEmbeddingService(),
      createMockRetrievalService([]),
      mockPromptAssembler(),
      createMockLLMService("Here you go."),
      mockResponseFormatter(formatted),
      createMockChatLogger()
    )

    const response = await orchestrator.handle(Buffer.from([1, 2, 3]), "sneakers", session)

    expect(response).toBe(formatted)
  })

  it("blends image and text scores (0.6·image + 0.4·text) and sorts by the blend", async () => {
    const shared = product("shared")
    const imageOnly = product("image-only")
    const textOnly = product("text-only")

    const imageResults: RetrievalResult[] = [
      { product: shared, similarityScore: 0.5 },
      { product: imageOnly, similarityScore: 0.7 },
    ]
    const textResults: RetrievalResult[] = [
      { product: shared, similarityScore: 0.9 },
      { product: textOnly, similarityScore: 0.6 },
    ]

    const promptAssembler = mockPromptAssembler()

    const orchestrator = new ImageOrchestrator(
      mockQueryParser(parsedQuery({ rawQuery: "shoes", embeddingText: "shoes" })),
      createMockImageEmbeddingService(),
      mockImageRetrievalService(imageResults),
      createMockEmbeddingService(),
      createMockRetrievalService(textResults),
      promptAssembler,
      createMockLLMService(),
      mockResponseFormatter(chatResponse()),
      createMockChatLogger()
    )

    await orchestrator.handle(Buffer.from([1]), "shoes", session)

    const [{ retrievedProducts }] = (promptAssembler.assemble as jest.Mock).mock.calls[0]
    // shared is in BOTH sets → 0.6·0.5 + 0.4·0.9 = 0.66, so it outranks the
    // single-modality matches (0.6·0.7 = 0.42 image-only, 0.4·0.6 = 0.24 text-only).
    const scored = retrievedProducts.map((r: RetrievalResult) => [
      r.product.id,
      Number(r.similarityScore.toFixed(2)),
    ])
    expect(scored).toEqual([
      ["shared", 0.66],
      ["image-only", 0.42],
      ["text-only", 0.24],
    ])
  })

  it("de-duplicates a product present in both sets into a single blended entry", async () => {
    const dup = product("dup")
    const promptAssembler = mockPromptAssembler()

    const orchestrator = new ImageOrchestrator(
      mockQueryParser(parsedQuery({ rawQuery: "shoes", embeddingText: "shoes" })),
      createMockImageEmbeddingService(),
      mockImageRetrievalService([{ product: dup, similarityScore: 0.8 }]),
      createMockEmbeddingService(),
      createMockRetrievalService([{ product: dup, similarityScore: 0.5 }]),
      promptAssembler,
      createMockLLMService(),
      mockResponseFormatter(chatResponse()),
      createMockChatLogger()
    )

    await orchestrator.handle(Buffer.from([1]), "shoes", session)

    const [{ retrievedProducts }] = (promptAssembler.assemble as jest.Mock).mock.calls[0]
    expect(retrievedProducts).toHaveLength(1)
    // 0.6·0.8 + 0.4·0.5 = 0.68
    expect(Number(retrievedProducts[0].similarityScore.toFixed(2))).toBe(0.68)
  })

  it("caps merged results at TOP_K (5) before assembling the prompt", async () => {
    const imageResults: RetrievalResult[] = Array.from({ length: 4 }, (_, i) => ({
      product: product(`img${i}`),
      similarityScore: 0.9 - i * 0.01,
    }))
    const textResults: RetrievalResult[] = Array.from({ length: 4 }, (_, i) => ({
      product: product(`txt${i}`),
      similarityScore: 0.5 - i * 0.01,
    }))

    const promptAssembler = mockPromptAssembler()

    const orchestrator = new ImageOrchestrator(
      mockQueryParser(parsedQuery()),
      createMockImageEmbeddingService(),
      mockImageRetrievalService(imageResults),
      createMockEmbeddingService(),
      createMockRetrievalService(textResults),
      promptAssembler,
      createMockLLMService(),
      mockResponseFormatter(chatResponse()),
      createMockChatLogger()
    )

    await orchestrator.handle(Buffer.from([1]), "shoes", session)

    const [{ retrievedProducts }] = (promptAssembler.assemble as jest.Mock).mock.calls[0]
    expect(retrievedProducts).toHaveLength(5)
  })

  it("skips the text search entirely when no text query is given", async () => {
    const embeddingService = createMockEmbeddingService()
    const retrievalService = createMockRetrievalService([])
    const queryParser = mockQueryParser(parsedQuery())

    const orchestrator = new ImageOrchestrator(
      queryParser,
      createMockImageEmbeddingService(),
      mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.8 }]),
      embeddingService,
      retrievalService,
      mockPromptAssembler(),
      createMockLLMService(),
      mockResponseFormatter(chatResponse()),
      createMockChatLogger()
    )

    await orchestrator.handle(Buffer.from([1]), undefined, session)

    expect(queryParser.parse).toHaveBeenCalledWith("")
    expect(embeddingService.embedText).not.toHaveBeenCalled()
    expect(retrievalService.search).not.toHaveBeenCalled()
  })

  describe("chat logging (drives the analytics 'lost sale' signal)", () => {
    it("logs hasResults: true when the top merged score meets the 0.60 image threshold", async () => {
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(
          parsedQuery({ rawQuery: "sneakers", embeddingText: "sneakers", category: "shoes" })
        ),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.6 }]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await orchestrator.handle(Buffer.from([1]), "sneakers", session)

      expect(chatLogger.log).toHaveBeenCalledWith({
        userId: "user_1",
        sessionId: "session_1",
        userQuery: "sneakers",
        retrievedIds: ["medusa_p1"],
        topScore: 0.6,
        hasResults: true,
        categoryHint: "shoes",
      })
    })

    it("logs hasResults: false when the top merged score is just below the 0.60 image threshold", async () => {
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.59 }]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await orchestrator.handle(Buffer.from([1]), undefined, session)

      expect(chatLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ topScore: 0.59, hasResults: false, userQuery: "(image search)" })
      )
    })

    it("logs topScore: 0 and hasResults: false when no results are retrieved", async () => {
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse({ products: [] })),
        chatLogger
      )

      await orchestrator.handle(Buffer.from([1]), undefined, session)

      expect(chatLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ topScore: 0, hasResults: false, retrievedIds: [] })
      )
    })
  })

  describe("error propagation", () => {
    it("propagates a failure from imageEmbeddingService.embedImage and never logs", async () => {
      const imageEmbeddingService = createMockImageEmbeddingService()
      ;(imageEmbeddingService.embedImage as jest.Mock).mockRejectedValue(new Error("bad image"))
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        imageEmbeddingService,
        mockImageRetrievalService([]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await expect(orchestrator.handle(Buffer.from([1]), undefined, session)).rejects.toThrow(
        "bad image"
      )
      expect(chatLogger.log).not.toHaveBeenCalled()
    })

    it("propagates a failure from imageRetrievalService.search and never logs", async () => {
      const imageRetrievalService = mockImageRetrievalService([])
      ;(imageRetrievalService.search as jest.Mock).mockRejectedValue(new Error("db down"))
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        imageRetrievalService,
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await expect(orchestrator.handle(Buffer.from([1]), undefined, session)).rejects.toThrow(
        "db down"
      )
      expect(chatLogger.log).not.toHaveBeenCalled()
    })

    it("propagates a failure from llmService.complete and never logs", async () => {
      const llmService = createMockLLMService()
      ;(llmService.complete as jest.Mock).mockRejectedValue(new Error("llm timeout"))
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.8 }]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        llmService,
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await expect(orchestrator.handle(Buffer.from([1]), undefined, session)).rejects.toThrow(
        "llm timeout"
      )
      expect(chatLogger.log).not.toHaveBeenCalled()
    })
  })
})
