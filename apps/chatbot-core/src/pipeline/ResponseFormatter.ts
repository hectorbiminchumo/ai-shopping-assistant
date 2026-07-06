import { meetsSimilarityThreshold } from "../utils"
import type { ChatResponse, ProductCard, RetrievalResult } from "../types"

// The LLM ends each reply with a "RECOMMENDED: 1, 3" trailer naming the
// catalog matches it actually recommended (numbered by relevance order,
// matching formatProductsForPrompt). Tolerates markdown emphasis around it.
const RECOMMENDED_LINE = /\n?\s*\**RECOMMENDED:?\**\s*(none|[\d,\s]+?)\**\s*$/i

// Formats the LLM's raw text reply + retrieved products into the
// structured ChatResponse the storefront renders (message + product cards).
// Only the products the LLM actually recommended become cards, so the cards
// never contradict the message (e.g. no cards under a clarifying question).
export class ResponseFormatter {
  format(llmMessage: string, retrieved: RetrievalResult[]): ChatResponse {
    const byRelevance = [...retrieved].sort((a, b) => b.similarityScore - a.similarityScore)
    const topScore = byRelevance[0]?.similarityScore ?? 0
    const { message, recommended } = this.extractRecommended(llmMessage, byRelevance)

    return {
      message,
      products: recommended.map((r) => this.toProductCard(r)),
      hasResults: meetsSimilarityThreshold(topScore),
    }
  }

  private extractRecommended(
    llmMessage: string,
    byRelevance: RetrievalResult[]
  ): { message: string; recommended: RetrievalResult[] } {
    const match = llmMessage.match(RECOMMENDED_LINE)

    if (!match) {
      // No trailer (nonconforming reply): fall back to the threshold filter
      return {
        message: llmMessage.trim(),
        recommended: byRelevance.filter((r) => meetsSimilarityThreshold(r.similarityScore)),
      }
    }

    const message = llmMessage.slice(0, match.index).trim()
    if (match[1].trim().toLowerCase() === "none") {
      return { message, recommended: [] }
    }

    const indices = [
      ...new Set(
        match[1]
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= byRelevance.length)
      ),
    ]
    return { message, recommended: indices.map((n) => byRelevance[n - 1]) }
  }

  private toProductCard(result: RetrievalResult): ProductCard {
    const { product } = result
    const variantPrices = product.variants.map((v) => v.price)
    const priceMin = variantPrices.length > 0 ? Math.min(...variantPrices) : product.priceMin
    const priceMax = variantPrices.length > 0 ? Math.max(...variantPrices) : product.priceMax

    return {
      id: product.id,
      medusaProductId: product.medusaProductId,
      title: product.title,
      thumbnailUrl: product.thumbnailUrl,
      priceMin,
      priceMax,
      similarityScore: result.similarityScore,
    }
  }
}
