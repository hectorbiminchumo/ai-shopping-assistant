import { Reranker } from "../../../src/pipeline/Reranker"
import type { ParsedQuery, RetrievalResult } from "../../../src/types"

const makeResult = (
  overrides: Partial<{
    id: string
    category: string | undefined
    priceMin: number | undefined
    similarityScore: number
  }> = {}
): RetrievalResult => ({
  similarityScore: overrides.similarityScore ?? 0.45,
  product: {
    id: overrides.id ?? "prod_1",
    medusaProductId: overrides.id ?? "medusa_1",
    title: "Test Product",
    description: "A test product",
    category: overrides.category,
    tags: [],
    priceMin: overrides.priceMin,
    variants: [],
  },
})

const noFilter: ParsedQuery = { rawQuery: "running shoes", embeddingText: "running shoes" }

describe("Reranker.rerank", () => {
  const reranker = new Reranker()

  it("returns at most topK results", () => {
    const results = Array.from({ length: 8 }, (_, i) =>
      makeResult({ id: `prod_${i}`, similarityScore: 0.5 - i * 0.01 })
    )
    expect(reranker.rerank(noFilter, results, 5)).toHaveLength(5)
  })

  it("returns all results when fewer than topK are provided", () => {
    const results = [makeResult({ id: "a" }), makeResult({ id: "b" })]
    expect(reranker.rerank(noFilter, results, 5)).toHaveLength(2)
  })

  it("orders by similarity score when no query filters are set", () => {
    const low = makeResult({ id: "low", similarityScore: 0.38 })
    const high = makeResult({ id: "high", similarityScore: 0.50 })
    const mid = makeResult({ id: "mid", similarityScore: 0.44 })

    const ranked = reranker.rerank(noFilter, [low, high, mid])

    expect(ranked[0].product.id).toBe("high")
    expect(ranked[1].product.id).toBe("mid")
    expect(ranked[2].product.id).toBe("low")
  })

  it("boosts a cheaper product above a more expensive one of equal similarity when priceMax is set", () => {
    const expensive = makeResult({ id: "expensive", similarityScore: 0.45, priceMin: 90 })
    const cheap = makeResult({ id: "cheap", similarityScore: 0.45, priceMin: 30 })

    const query: ParsedQuery = { rawQuery: "shoes", embeddingText: "shoes", priceMax: 100 }
    const ranked = reranker.rerank(query, [expensive, cheap])

    expect(ranked[0].product.id).toBe("cheap")
  })

  it("boosts a category-matching product above a non-matching one of equal similarity", () => {
    const wrong = makeResult({ id: "wrong", similarityScore: 0.45, category: "jackets" })
    const correct = makeResult({ id: "correct", similarityScore: 0.45, category: "running shoes" })

    const query: ParsedQuery = {
      rawQuery: "shoes",
      embeddingText: "shoes",
      category: "running shoes",
    }
    const ranked = reranker.rerank(query, [wrong, correct])

    expect(ranked[0].product.id).toBe("correct")
  })

  it("preserves the original similarityScore on returned results", () => {
    const original = 0.48
    const result = makeResult({ similarityScore: original })
    const ranked = reranker.rerank(noFilter, [result])

    expect(ranked[0].similarityScore).toBe(original)
  })

  it("treats products with no price data as neutral when priceMax is set", () => {
    // No priceMin → neutral score; higher similarity should win
    const noPriceHighSim = makeResult({ id: "no-price", similarityScore: 0.50, priceMin: undefined })
    const withPriceLowSim = makeResult({ id: "with-price", similarityScore: 0.40, priceMin: 30 })

    const query: ParsedQuery = { rawQuery: "shoes", embeddingText: "shoes", priceMax: 100 }
    const ranked = reranker.rerank(query, [noPriceHighSim, withPriceLowSim])

    expect(ranked[0].product.id).toBe("no-price")
  })

  it("returns an empty array when given an empty input", () => {
    expect(reranker.rerank(noFilter, [])).toEqual([])
  })

  it("keeps a high-similarity product near the price ceiling in the topK over several cheaper, less relevant ones", () => {
    // Regression: with priceMax set, every candidate already fits the budget
    // (the SQL layer filtered them) — priceMatch must only be a tie-breaker,
    // never strong enough to push a clearly-better semantic match out of the
    // topK just because it costs close to the stated max.
    const nearCeiling = makeResult({ id: "near-ceiling", similarityScore: 0.545, priceMin: 108 })
    const cheaperDistractors = [
      makeResult({ id: "d1", similarityScore: 0.50, priceMin: 80 }),
      makeResult({ id: "d2", similarityScore: 0.49, priceMin: 85 }),
      makeResult({ id: "d3", similarityScore: 0.48, priceMin: 80 }),
      makeResult({ id: "d4", similarityScore: 0.47, priceMin: 100 }),
    ]

    const query: ParsedQuery = { rawQuery: "shoes under 115", embeddingText: "shoes", priceMax: 115 }
    const ranked = reranker.rerank(query, [nearCeiling, ...cheaperDistractors], 5)

    expect(ranked.map((r) => r.product.id)).toContain("near-ceiling")
  })
})
