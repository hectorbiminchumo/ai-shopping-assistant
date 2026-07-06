import { QueryParser } from "../../src/pipeline/QueryParser"
import { Reranker } from "../../src/pipeline/Reranker"
import { SearchOrchestrator } from "../../src/orchestrator/SearchOrchestrator"
import { EmbeddingError } from "../../src/errors"
import type { Product, RetrievalResult } from "../../src/types"
import { createMockEmbeddingService } from "../mocks/voyageai.mock"
import { createMockRetrievalService } from "../mocks/supabase.mock"

const product: Product = {
  id: "prod_1",
  medusaProductId: "medusa_1",
  title: "Trail Runner X",
  description: "A lightweight trail running shoe.",
  category: "running shoes",
  tags: ["trail", "running"],
  thumbnailUrl: "https://example.com/trail-runner.jpg",
  priceMin: 89,
  priceMax: 89,
  variants: [],
}

function makeResult(score = 0.75, p = product): RetrievalResult {
  return { product: p, similarityScore: score }
}

function buildOrchestrator(
  embeddingService = createMockEmbeddingService(),
  retrievalService = createMockRetrievalService([makeResult()])
) {
  return new SearchOrchestrator(
    new QueryParser(),
    embeddingService,
    retrievalService,
    new Reranker()
  )
}

describe("SearchOrchestrator (integration, mocked providers)", () => {
  // ── structure ─────────────────────────────────────────────────────────────

  it("returns an object with products array and hasResults boolean", async () => {
    const result = await buildOrchestrator().search("trail running shoes")

    expect(result).toMatchObject({
      products: expect.any(Array),
      hasResults: expect.any(Boolean),
    })
  })

  it("each product card contains the required fields", async () => {
    const result = await buildOrchestrator().search("trail running shoes")

    expect(result.products).toHaveLength(1)
    expect(result.products[0]).toMatchObject({
      id: "prod_1",
      medusaProductId: "medusa_1",
      title: "Trail Runner X",
      thumbnailUrl: "https://example.com/trail-runner.jpg",
      priceMin: 89,
      priceMax: 89,
      similarityScore: 0.75,
    })
  })

  it("sets hasResults: true when at least one result meets the similarity threshold", async () => {
    const result = await buildOrchestrator().search("trail running shoes")
    expect(result.hasResults).toBe(true)
  })

  // ── call order ────────────────────────────────────────────────────────────

  it("generates the embedding before querying the vector store", async () => {
    const callOrder: string[] = []
    const embeddingService = {
      embedText: jest.fn().mockImplementation(async () => {
        callOrder.push("embedText")
        return [0.1, 0.2, 0.3]
      }),
      embedBatch: jest.fn(),
    }
    const retrievalService = {
      search: jest.fn().mockImplementation(async () => {
        callOrder.push("search")
        return []
      }),
      listCategories: jest.fn().mockResolvedValue([]),
    }

    await new SearchOrchestrator(new QueryParser(), embeddingService, retrievalService, new Reranker()).search(
      "trail shoes"
    )

    expect(callOrder.indexOf("embedText")).toBeLessThan(callOrder.indexOf("search"))
  })

  it("passes the embedding vector from EmbeddingService into RetrievalService.search", async () => {
    const fakeEmbedding = [0.11, 0.22, 0.33]
    const embeddingService = createMockEmbeddingService(fakeEmbedding)
    const retrievalService = createMockRetrievalService([])

    await new SearchOrchestrator(new QueryParser(), embeddingService, retrievalService, new Reranker()).search(
      "running shoes"
    )

    expect(retrievalService.search).toHaveBeenCalledWith(fakeEmbedding, expect.anything(), expect.anything())
  })

  it("requests RETRIEVE_K (10) candidates from the vector store", async () => {
    const retrievalService = createMockRetrievalService([])

    await new SearchOrchestrator(
      new QueryParser(),
      createMockEmbeddingService(),
      retrievalService,
      new Reranker()
    ).search("shoes")

    expect(retrievalService.search).toHaveBeenCalledWith(expect.anything(), expect.anything(), 10)
  })

  // ── re-ranking ────────────────────────────────────────────────────────────

  it("caps results to RERANK_K (5) even when the vector store returns more", async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) => makeResult(0.75 - i * 0.01))
    const result = await buildOrchestrator(
      createMockEmbeddingService(),
      createMockRetrievalService(manyResults)
    ).search("running shoes")

    expect(result.products.length).toBeLessThanOrEqual(5)
  })

  it("applies category filter from the parsed query to the retrieval call", async () => {
    const retrievalService = createMockRetrievalService([makeResult()], ["running shoes"])

    await new SearchOrchestrator(
      new QueryParser(),
      createMockEmbeddingService(),
      retrievalService,
      new Reranker()
    ).search("running shoes for women")

    expect(retrievalService.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "running shoes" }),
      expect.anything()
    )
  })

  // ── empty / no-match ──────────────────────────────────────────────────────

  it("returns hasResults: false and empty products when retrieval returns nothing", async () => {
    const result = await buildOrchestrator(
      createMockEmbeddingService(),
      createMockRetrievalService([])
    ).search("trail running shoes")

    expect(result.hasResults).toBe(false)
    expect(result.products).toEqual([])
  })

  it("filters out results below the similarity threshold (0.40)", async () => {
    const result = await buildOrchestrator(
      createMockEmbeddingService(),
      createMockRetrievalService([makeResult(0.2), makeResult(0.3)])
    ).search("trail shoes")

    expect(result.hasResults).toBe(false)
    expect(result.products).toEqual([])
  })

  it("returns only results that meet the threshold when the set is mixed", async () => {
    const result = await buildOrchestrator(
      createMockEmbeddingService(),
      createMockRetrievalService([makeResult(0.75), makeResult(0.2)])
    ).search("shoes")

    expect(result.hasResults).toBe(true)
    expect(result.products).toHaveLength(1)
    expect(result.products[0].similarityScore).toBe(0.75)
  })

  // ── error handling ────────────────────────────────────────────────────────

  it("handles an empty query string without throwing", async () => {
    await expect(buildOrchestrator().search("")).resolves.toMatchObject({
      products: expect.any(Array),
      hasResults: expect.any(Boolean),
    })
  })

  it("propagates EmbeddingError when the Voyage AI call fails (e.g. timeout)", async () => {
    const embeddingService = {
      embedText: jest.fn().mockRejectedValue(new EmbeddingError("Request timeout")),
      embedBatch: jest.fn(),
    }

    await expect(
      buildOrchestrator(embeddingService).search("trail shoes")
    ).rejects.toThrow(EmbeddingError)
    await expect(
      buildOrchestrator(embeddingService).search("trail shoes")
    ).rejects.toThrow("Request timeout")
  })
})
