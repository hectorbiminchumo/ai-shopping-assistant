import type { ImageEmbeddingService, ImageRetrievalService } from "../../src/image"
import { PromptAssembler } from "../../src/pipeline/PromptAssembler"
import { QueryParser } from "../../src/pipeline/QueryParser"
import { ResponseFormatter } from "../../src/pipeline/ResponseFormatter"
import { ImageOrchestrator } from "../../src/orchestrator/ImageOrchestrator"
import type { ChatSession, Product, RetrievalResult } from "../../src/types"
import { createMockLLMService } from "../mocks/openai.mock"
import { createMockChatLogger, createMockRetrievalService } from "../mocks/supabase.mock"
import { createMockEmbeddingService } from "../mocks/voyageai.mock"

const imageMatch: Product = {
  id: "prod_image",
  medusaProductId: "medusa_image",
  title: "Visual Match Sneaker",
  description: "Looks like the uploaded photo.",
  tags: [],
  variants: [{ id: "var_1", title: "42", sku: "VMS-42", price: 100, inventoryQuantity: 2, options: {} }],
}

const textMatch: Product = {
  id: "prod_text",
  medusaProductId: "medusa_text",
  title: "Text Match Sneaker",
  description: "Matched the text query.",
  tags: [],
  variants: [{ id: "var_2", title: "42", sku: "TMS-42", price: 80, inventoryQuantity: 4, options: {} }],
}

const session: ChatSession = { sessionId: "session_1", history: [] }

function createMockImageEmbeddingService(): ImageEmbeddingService {
  return { embedImage: jest.fn().mockResolvedValue([0.1, 0.2]) } as unknown as ImageEmbeddingService
}

function createMockImageRetrievalService(results: RetrievalResult[]): ImageRetrievalService {
  return { search: jest.fn().mockResolvedValue(results) } as unknown as ImageRetrievalService
}

describe("ImageOrchestrator (integration, mocked providers)", () => {
  it("blends image + text results and ranks the visual match ahead of the text-only one", async () => {
    const imageResults: RetrievalResult[] = [{ product: imageMatch, similarityScore: 0.7 }]
    const textResults: RetrievalResult[] = [{ product: textMatch, similarityScore: 0.9 }]

    // Trailer so the ResponseFormatter emits cards in the catalog (blend) order.
    const llmService = createMockLLMService("Here's what matches your photo.\nRECOMMENDED: 1, 2")
    const chatLogger = createMockChatLogger()

    const orchestrator = new ImageOrchestrator(
      new QueryParser(),
      createMockImageEmbeddingService(),
      createMockImageRetrievalService(imageResults),
      createMockEmbeddingService(),
      createMockRetrievalService(textResults),
      new PromptAssembler(),
      llmService,
      new ResponseFormatter(),
      chatLogger
    )

    const response = await orchestrator.handle(Buffer.from([1, 2, 3]), "sneakers", session)

    // Blend: visual match 0.6·0.7 = 0.42 outranks text-only 0.4·0.9 = 0.36, so
    // in an image search the product that looks like the photo leads.
    expect(response.products).toHaveLength(2)
    expect(response.products[0].title).toBe("Visual Match Sneaker")
    expect(response.products[1].title).toBe("Text Match Sneaker")
    expect(response.hasResults).toBe(true)
    expect(chatLogger.log).toHaveBeenCalled()
  })

  it("works with image-only search when no text query is given", async () => {
    const imageResults: RetrievalResult[] = [{ product: imageMatch, similarityScore: 0.65 }]

    const orchestrator = new ImageOrchestrator(
      new QueryParser(),
      createMockImageEmbeddingService(),
      createMockImageRetrievalService(imageResults),
      createMockEmbeddingService(),
      createMockRetrievalService([]),
      new PromptAssembler(),
      createMockLLMService(),
      new ResponseFormatter(),
      createMockChatLogger()
    )

    const response = await orchestrator.handle(Buffer.from([1, 2, 3]), undefined, session)

    expect(response.products).toHaveLength(1)
    expect(response.products[0].title).toBe("Visual Match Sneaker")
  })
})
