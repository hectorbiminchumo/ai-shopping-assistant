import { meetsSimilarityThreshold } from "../utils"
import type { ChatResponse, ProductCard, RetrievalResult } from "../types"

// Formats the LLM's raw text reply + retrieved products into the
// structured ChatResponse the storefront renders (message + product cards).
export class ResponseFormatter {
  format(llmMessage: string, retrieved: RetrievalResult[]): ChatResponse {
    const topScore = retrieved[0]?.similarityScore ?? 0

    return {
      message: llmMessage,
      products: retrieved.map((r) => this.toProductCard(r)),
      hasResults: meetsSimilarityThreshold(topScore),
    }
  }

  private toProductCard(result: RetrievalResult): ProductCard {
    const prices = result.product.variants.map((v) => v.price)

    return {
      id: result.product.medusaProductId,
      title: result.product.title,
      thumbnailUrl: result.product.thumbnailUrl,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      similarityScore: result.similarityScore,
    }
  }
}
