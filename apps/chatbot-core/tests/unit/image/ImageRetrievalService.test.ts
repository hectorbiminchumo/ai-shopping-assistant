import { RetrievalError } from "../../../src/errors"
import { ImageRetrievalService } from "../../../src/image/ImageRetrievalService"

const mockRpc = jest.fn()
const mockGetSupabaseClient = jest.fn()
// getImageEmbedding uses the query builder rather than an RPC; each call in the
// chain returns the builder so only maybeSingle() needs to resolve.
const mockMaybeSingle = jest.fn()
const mockEq = jest.fn()
const mockSelect = jest.fn()
const mockFrom = jest.fn()

jest.mock("../../../src/config", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}))

function row(overrides: Partial<{ id: string; similarity: number }> = {}) {
  const id = overrides.id ?? "p1"
  return {
    id,
    medusa_product_id: `medusa_${id}`,
    title: "Product",
    description: "Description",
    category: "shoes",
    tags: ["running"],
    price_min: 50,
    price_max: 80,
    thumbnail_url: "https://example.com/img.png",
    similarity: overrides.similarity ?? 0.5,
  }
}

describe("ImageRetrievalService", () => {
  const service = new ImageRetrievalService()

  beforeEach(() => {
    mockRpc.mockReset()
    mockGetSupabaseClient.mockReset()
    mockMaybeSingle.mockReset()
    mockEq.mockReset().mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockSelect.mockReset().mockReturnValue({ eq: mockEq })
    mockFrom.mockReset().mockReturnValue({ select: mockSelect })
    mockGetSupabaseClient.mockReturnValue({ rpc: mockRpc, from: mockFrom })
  })

  it("calls match_products_by_image with the embedding and topK", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await service.search([0.1, 0.2, 0.3], 5)

    expect(mockRpc).toHaveBeenCalledWith("match_products_by_image", {
      query_embedding: [0.1, 0.2, 0.3],
      match_count: 5,
    })
  })

  // ImageRetrievalService does not sort in JS — Postgres/pgvector returns
  // rows already ordered by similarity. This test just guards against the
  // mapping step accidentally reordering them.
  it("maps rows to RetrievalResult, preserving the order returned by the RPC", async () => {
    mockRpc.mockResolvedValue({
      data: [
        row({ id: "p1", similarity: 0.92 }),
        row({ id: "p2", similarity: 0.81 }),
        row({ id: "p3", similarity: 0.65 }),
      ],
      error: null,
    })

    const results = await service.search([0.1], 3)

    expect(results.map((r) => r.product.id)).toEqual(["p1", "p2", "p3"])
    expect(results.map((r) => r.similarityScore)).toEqual([0.92, 0.81, 0.65])
  })

  it("maps nulls in the row to undefined/empty array on the Product", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "p1",
          medusa_product_id: "medusa_1",
          title: "Trail Runner",
          description: "A trail running shoe.",
          category: null,
          tags: null,
          price_min: null,
          price_max: null,
          thumbnail_url: null,
          similarity: 0.7,
        },
      ],
      error: null,
    })

    const [result] = await service.search([0.1], 1)

    expect(result.product).toEqual({
      id: "p1",
      medusaProductId: "medusa_1",
      title: "Trail Runner",
      description: "A trail running shoe.",
      category: undefined,
      tags: [],
      thumbnailUrl: undefined,
      priceMin: undefined,
      priceMax: undefined,
      variants: [],
    })
    expect(result.similarityScore).toBe(0.7)
  })

  it("returns an empty array when the RPC returns no data", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const results = await service.search([0.1], 5)

    expect(results).toEqual([])
  })

  it("wraps a Supabase RPC error in RetrievalError", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function match_products_by_image does not exist" },
    })

    await expect(service.search([0.1], 5)).rejects.toThrow(RetrievalError)
    await expect(service.search([0.1], 5)).rejects.toThrow(
      "function match_products_by_image does not exist"
    )
  })

  it("wraps an unexpected thrown error (e.g. unconfigured Supabase client) in RetrievalError", async () => {
    mockGetSupabaseClient.mockImplementation(() => {
      throw new Error("Supabase is not configured")
    })

    await expect(service.search([0.1], 5)).rejects.toThrow(RetrievalError)
    await expect(service.search([0.1], 5)).rejects.toThrow("Image vector search failed")
  })

  // The 0.42 similarity cutoff (IMAGE_SIMILARITY_THRESHOLD) is applied by
  // ImageOrchestrator via meetsImageSimilarityThreshold, not here — this
  // service returns whatever rows the RPC gives it, unfiltered.
  it("does not filter rows by the 0.42 image similarity threshold", async () => {
    mockRpc.mockResolvedValue({ data: [row({ id: "p1", similarity: 0.12 })], error: null })

    const results = await service.search([0.1], 5)

    expect(results).toHaveLength(1)
    expect(results[0].similarityScore).toBe(0.12)
  })

  describe("getImageEmbedding", () => {
    it("reads the indexed embedding for a product", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { image_embedding: [0.1, 0.2] }, error: null })

      const embedding = await service.getImageEmbedding("medusa_p1")

      expect(mockFrom).toHaveBeenCalledWith("product_embeddings")
      expect(mockSelect).toHaveBeenCalledWith("image_embedding")
      expect(mockEq).toHaveBeenCalledWith("medusa_product_id", "medusa_p1")
      expect(embedding).toEqual([0.1, 0.2])
    })

    // Supabase returns pgvector columns JSON-encoded, not as a JS array
    it("parses the embedding when it arrives as a JSON string", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { image_embedding: "[0.1,0.2]" }, error: null })

      expect(await service.getImageEmbedding("medusa_p1")).toEqual([0.1, 0.2])
    })

    it("returns null for an unknown product", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      expect(await service.getImageEmbedding("medusa_missing")).toBeNull()
    })

    // Distinct from "unknown product" only to the caller's eye — both mean the
    // product cannot be used as a visual query, which is a 404, not an error.
    it("returns null for a product that was never image-indexed", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { image_embedding: null }, error: null })

      expect(await service.getImageEmbedding("medusa_p1")).toBeNull()
    })

    it("wraps a Supabase error in a RetrievalError", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "column missing" } })

      await expect(service.getImageEmbedding("medusa_p1")).rejects.toThrow(RetrievalError)
      await expect(service.getImageEmbedding("medusa_p1")).rejects.toThrow("column missing")
    })

    it("wraps an unconfigured client in a RetrievalError", async () => {
      mockGetSupabaseClient.mockImplementation(() => {
        throw new Error("Supabase is not configured")
      })

      await expect(service.getImageEmbedding("medusa_p1")).rejects.toThrow(
        "Failed to read product image embedding"
      )
    })
  })
})
