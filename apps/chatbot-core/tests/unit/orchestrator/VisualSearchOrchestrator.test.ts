import { VisualSearchOrchestrator } from "../../../src/orchestrator/VisualSearchOrchestrator"
import type { ImageRetrievalService } from "../../../src/image"
import type { Product, RetrievalResult } from "../../../src/types"

function product(id: string): Product {
  return {
    id: `uuid_${id}`,
    medusaProductId: id,
    title: `Product ${id}`,
    description: "Description",
    category: "shoes",
    tags: [],
    thumbnailUrl: `https://example.com/${id}.png`,
    priceMin: 50,
    priceMax: 80,
    variants: [],
  }
}

const result = (id: string, similarityScore: number): RetrievalResult => ({
  product: product(id),
  similarityScore,
})

function mockRetrieval(embedding: number[] | null, results: RetrievalResult[] = []) {
  return {
    getImageEmbedding: jest.fn().mockResolvedValue(embedding),
    search: jest.fn().mockResolvedValue(results),
  } as unknown as ImageRetrievalService
}

describe("VisualSearchOrchestrator", () => {
  it("returns null when the product has no indexed image embedding", async () => {
    const retrieval = mockRetrieval(null)

    expect(await new VisualSearchOrchestrator(retrieval).search("prod_1")).toBeNull()
    // No point running a vector search without a query vector
    expect(retrieval.search).not.toHaveBeenCalled()
  })

  it("searches with the product's own stored embedding", async () => {
    const retrieval = mockRetrieval([0.1, 0.2])

    await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(retrieval.getImageEmbedding).toHaveBeenCalledWith("prod_1")
    expect(retrieval.search).toHaveBeenCalledWith([0.1, 0.2], 6)
  })

  // The query product is its own nearest neighbour at similarity 1.0 — showing
  // it back would make "similar products" list the product being viewed.
  it("excludes the query product from its own results", async () => {
    const retrieval = mockRetrieval(
      [0.1],
      [result("prod_1", 1), result("prod_2", 0.8), result("prod_3", 0.7)]
    )

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(response!.products.map((p) => p.medusaProductId)).toEqual(["prod_2", "prod_3"])
  })

  // Asking for topK + 1 means a full topK survives dropping the query product
  it("still returns topK products after removing the query product", async () => {
    const retrieval = mockRetrieval(
      [0.1],
      [
        result("prod_1", 1),
        result("prod_2", 0.9),
        result("prod_3", 0.85),
        result("prod_4", 0.8),
        result("prod_5", 0.75),
        result("prod_6", 0.7),
      ]
    )

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(response!.products).toHaveLength(5)
  })

  it("drops results below the image similarity threshold", async () => {
    const retrieval = mockRetrieval(
      [0.1],
      [result("prod_2", 0.5), result("prod_3", 0.4401), result("prod_4", 0.419)]
    )

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(response!.products.map((p) => p.medusaProductId)).toEqual(["prod_2", "prod_3"])
  })

  it("reports hasResults: false when everything falls below the threshold", async () => {
    const retrieval = mockRetrieval([0.1], [result("prod_2", 0.2)])

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(response).toEqual({ products: [], hasResults: false })
  })

  it("maps results to product cards with their scores", async () => {
    const retrieval = mockRetrieval([0.1], [result("prod_2", 0.83)])

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1")

    expect(response!.products[0]).toEqual({
      id: "uuid_prod_2",
      medusaProductId: "prod_2",
      title: "Product prod_2",
      thumbnailUrl: "https://example.com/prod_2.png",
      priceMin: 50,
      priceMax: 80,
      similarityScore: 0.83,
    })
    expect(response!.hasResults).toBe(true)
  })

  it("honours an explicit topK", async () => {
    const retrieval = mockRetrieval([0.1], [result("prod_2", 0.9), result("prod_3", 0.8)])

    const response = await new VisualSearchOrchestrator(retrieval).search("prod_1", 1)

    expect(retrieval.search).toHaveBeenCalledWith([0.1], 2)
    expect(response!.products).toHaveLength(1)
  })
})
