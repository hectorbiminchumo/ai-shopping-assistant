import type { ImageRetrievalService } from "../../../src/image"
import { ImageOrchestrator } from "../../../src/orchestrator/ImageOrchestrator"
import type { PromptAssembler, QueryParser, ResponseFormatter } from "../../../src/pipeline"
import type { ChatResponse, ChatSession, ParsedQuery, Product, RetrievalResult } from "../../../src/types"
import { createMockImageEmbeddingService } from "../../mocks/image-embedding.mock"
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

  // The core of the "bicycle returns shoes" fix: a vector search always yields
  // neighbours and the image prompt makes the LLM present them, so the only
  // thing that knows the photo matches nothing is the similarity score. Below
  // the threshold the user must NOT see those false matches, even though the
  // formatter (trusting the LLM's RECOMMENDED trailer) produced cards.
  describe("gating the reply on visual similarity", () => {
    function buildOrchestrator(topScore: number, formatted: ChatResponse) {
      return new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: topScore }]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(formatted),
        createMockChatLogger()
      )
    }

    const withCards = () =>
      chatResponse({
        message: "The closest match to your photo is the ADIDAS Black Shoe.",
        products: [{ id: "p1", medusaProductId: "medusa_p1", title: "ADIDAS Black", similarityScore: 0.36 }],
        hasResults: true,
      })

    it("drops the cards and replaces the message when the top score is below the threshold", async () => {
      const response = await buildOrchestrator(0.36, withCards()).handle(
        Buffer.from([1]),
        undefined,
        session
      )

      expect(response.products).toEqual([])
      expect(response.hasResults).toBe(false)
      expect(response.message).toMatch(/couldn't find anything in our catalog that looks like/i)
    })

    it("passes the formatter's cards through when the top score meets the threshold", async () => {
      const formatted = withCards()
      const response = await buildOrchestrator(0.42, formatted).handle(
        Buffer.from([1]),
        undefined,
        session
      )

      expect(response).toBe(formatted)
    })

    // Regression: a good visual match (image 0.55) blended with a weak text
    // score drops the merged top score below 0.42. The gate must judge the raw
    // IMAGE score, or adding any text to an image search turns real matches
    // into "no results" — which is exactly what shipping the attach-text-with-
    // image composer surfaced.
    it("keeps the cards when the image matches but a weak text query drags the blend down", async () => {
      const formatted = withCards()
      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery({ rawQuery: "gym", embeddingText: "gym" })),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.55 }]),
        createMockEmbeddingService(),
        // Weak text match: blend = 0.6·0.55 + 0.4·0.10 = 0.37, below 0.42
        createMockRetrievalService([{ product: product("p1"), similarityScore: 0.1 }]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(formatted),
        createMockChatLogger()
      )

      const response = await orchestrator.handle(Buffer.from([1]), "gym", session)

      expect(response).toBe(formatted)
    })

    it("logs the pure image score as the lost-sale signal, not the blended one", async () => {
      const chatLogger = createMockChatLogger()
      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery({ rawQuery: "gym", embeddingText: "gym" })),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.55 }]),
        createMockEmbeddingService(),
        createMockRetrievalService([{ product: product("p1"), similarityScore: 0.1 }]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(withCards()),
        chatLogger
      )

      await orchestrator.handle(Buffer.from([1]), "gym", session)

      expect(chatLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ topScore: 0.55, hasResults: true })
      )
    })
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

  it("uses raw image scores unblended when a text query is given but text search returns no results", async () => {
    const imageResults: RetrievalResult[] = [
      { product: product("p1"), similarityScore: 0.55 },
      { product: product("p2"), similarityScore: 0.5 },
    ]
    const promptAssembler = mockPromptAssembler()

    const orchestrator = new ImageOrchestrator(
      mockQueryParser(parsedQuery({ rawQuery: "shoes", embeddingText: "shoes" })),
      createMockImageEmbeddingService(),
      mockImageRetrievalService(imageResults),
      createMockEmbeddingService(),
      createMockRetrievalService([]),
      promptAssembler,
      createMockLLMService(),
      mockResponseFormatter(chatResponse()),
      createMockChatLogger()
    )

    await orchestrator.handle(Buffer.from([1]), "shoes", session)

    // Text search ran (textQuery was truthy) but matched nothing, so
    // mergeResults is skipped entirely — scores stay the raw image
    // similarity, not attenuated by a phantom 0 text score (0.6·image).
    const [{ retrievedProducts }] = (promptAssembler.assemble as jest.Mock).mock.calls[0]
    expect(retrievedProducts).toEqual(imageResults)
  })

  describe("chat logging (drives the analytics 'lost sale' signal)", () => {
    it("logs hasResults: true when the top merged score meets the 0.42 image threshold", async () => {
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(
          parsedQuery({ rawQuery: "sneakers", embeddingText: "sneakers", category: "shoes" })
        ),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.42 }]),
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
        topScore: 0.42,
        hasResults: true,
        categoryHint: "shoes",
      })
    })

    it("logs hasResults: false when the top merged score is just below the 0.42 image threshold", async () => {
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery()),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.419 }]),
        createMockEmbeddingService(),
        createMockRetrievalService([]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      await orchestrator.handle(Buffer.from([1]), undefined, session)

      expect(chatLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ topScore: 0.419, hasResults: false, userQuery: "(image search)" })
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

    it("propagates a failure from llmService.completeImageSearch and never logs", async () => {
      const llmService = createMockLLMService()
      ;(llmService.completeImageSearch as jest.Mock).mockRejectedValue(new Error("llm timeout"))
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

    it("propagates a failure from retrievalService.search (text side) and never logs", async () => {
      const retrievalService = createMockRetrievalService([])
      ;(retrievalService.search as jest.Mock).mockRejectedValue(new Error("text search down"))
      const chatLogger = createMockChatLogger()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery({ rawQuery: "shoes", embeddingText: "shoes" })),
        createMockImageEmbeddingService(),
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.8 }]),
        createMockEmbeddingService(),
        retrievalService,
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        chatLogger
      )

      // textQuery must be truthy here — only then does Promise.all actually
      // invoke the text branch (searchByText), proving a text-side failure
      // fails the whole request rather than being silently swallowed.
      await expect(orchestrator.handle(Buffer.from([1]), "shoes", session)).rejects.toThrow(
        "text search down"
      )
      expect(chatLogger.log).not.toHaveBeenCalled()
    })
  })

  // Hybrid retrieval is only affordable because the two searches overlap: each
  // costs an embedding round-trip plus a vector query, so running them in
  // sequence roughly doubles the wait on the slowest endpoint in the product.
  // Nothing else in the suite pins that down — swapping the Promise.all for two
  // sequential awaits keeps every other test green while halving throughput.
  //
  // The proof is invocation order, not elapsed time: one branch is held pending
  // and the other must still have *started*. Deliberately no timers — fake ones
  // don't advance real promises, and real delays make CI flaky.
  describe("hybrid concurrency (image and text searches overlap)", () => {
    // Resolves only when release() is called, so the branch it belongs to stays
    // in flight for as long as the test needs.
    function pending<T>() {
      let release!: (value: T) => void
      const promise = new Promise<T>((resolve) => {
        release = resolve
      })
      return { promise, release }
    }

    // Lets every already-resolved microtask run, so "not called yet" means
    // genuinely not called rather than not called *so far this tick*.
    const flush = () => new Promise((resolve) => setImmediate(resolve))

    function buildOrchestrator(overrides: {
      imageEmbeddingService?: ReturnType<typeof createMockImageEmbeddingService>
      embeddingService?: ReturnType<typeof createMockEmbeddingService>
    }) {
      const imageEmbeddingService =
        overrides.imageEmbeddingService ?? createMockImageEmbeddingService()
      const embeddingService = overrides.embeddingService ?? createMockEmbeddingService()

      const orchestrator = new ImageOrchestrator(
        mockQueryParser(parsedQuery({ rawQuery: "shoes", embeddingText: "shoes" })),
        imageEmbeddingService,
        mockImageRetrievalService([{ product: product("p1"), similarityScore: 0.8 }]),
        embeddingService,
        createMockRetrievalService([{ product: product("p2"), similarityScore: 0.7 }]),
        mockPromptAssembler(),
        createMockLLMService(),
        mockResponseFormatter(chatResponse()),
        createMockChatLogger()
      )

      return { orchestrator, imageEmbeddingService, embeddingService }
    }

    it("starts the text search while the image search is still in flight", async () => {
      const held = pending<number[]>()
      const imageEmbeddingService = createMockImageEmbeddingService()
      ;(imageEmbeddingService.embedImage as jest.Mock).mockReturnValue(held.promise)

      const { orchestrator, embeddingService } = buildOrchestrator({ imageEmbeddingService })

      const inFlight = orchestrator.handle(Buffer.from([1]), "shoes", session)
      await flush()

      // Sequentially, this would still be waiting on the image branch
      expect(embeddingService.embedText).toHaveBeenCalledWith("shoes")

      held.release(Array(512).fill(0.1))
      await inFlight
    })

    it("starts the image search while the text search is still in flight", async () => {
      const held = pending<number[]>()
      const embeddingService = createMockEmbeddingService()
      ;(embeddingService.embedText as jest.Mock).mockReturnValue(held.promise)

      const { orchestrator, imageEmbeddingService } = buildOrchestrator({ embeddingService })

      const inFlight = orchestrator.handle(Buffer.from([1]), "shoes", session)
      await flush()

      // Guards the mirror image: neither branch may be moved out of Promise.all
      expect(imageEmbeddingService.embedImage).toHaveBeenCalled()

      held.release([0.1, 0.2, 0.3])
      await inFlight
    })
  })
})
