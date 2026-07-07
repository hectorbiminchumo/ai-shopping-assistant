import type { ParsedQuery, RetrievalResult } from "../types"

// Re-ranking weights — must sum to 1.0.
// Similarity dominates because it captures semantic fit.
// Price and category are tie-breakers within closely-scored candidates.
const W = { similarity: 0.60, priceMatch: 0.25, categoryMatch: 0.15 }

export class Reranker {
  /**
   * Re-ranks `results` using a composite score and returns the top `topK`.
   * The original `similarityScore` is preserved on the returned objects so
   * downstream consumers (chat_logs, product cards) still see the vector score.
   */
  rerank(
    query: ParsedQuery,
    results: RetrievalResult[],
    topK = 5
  ): RetrievalResult[] {
    return results
      .map((r) => ({ r, score: this.composite(query, r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ r }) => r)
  }

  private composite(query: ParsedQuery, r: RetrievalResult): number {
    return (
      W.similarity * r.similarityScore +
      W.priceMatch * this.priceScore(query, r) +
      W.categoryMatch * this.categoryScore(query, r)
    )
  }

  // Products that fit comfortably inside the stated budget score higher
  // (lower price relative to the max = better value for a budget-conscious query).
  // When no budget is stated the score is neutral (0.5) so it doesn't affect ordering.
  private priceScore(query: ParsedQuery, r: RetrievalResult): number {
    if (!query.priceMax) return 0.5
    const price = r.product.priceMin ?? r.product.priceMax
    if (price == null) return 0.5
    return Math.min(1, Math.max(0, 1 - price / query.priceMax))
  }

  // Products whose category exactly matches the parsed category score 1;
  // products with no category constraint score neutrally (0.5).
  private categoryScore(query: ParsedQuery, r: RetrievalResult): number {
    if (!query.category) return 0.5
    return r.product.category?.toLowerCase() === query.category.toLowerCase() ? 1 : 0
  }
}
