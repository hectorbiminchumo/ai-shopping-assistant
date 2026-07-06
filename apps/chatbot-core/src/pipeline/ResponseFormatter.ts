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
    const { product } = result
    const variantPrices = product.variants.map((v) => v.price)
    const priceMin = variantPrices.length > 0 ? Math.min(...variantPrices) : product.priceMin
    const priceMax = variantPrices.length > 0 ? Math.max(...variantPrices) : product.priceMax

    return {
      id: result.product.id,
      medusaProductId: result.product.medusaProductId,
      title: result.product.title,
      thumbnailUrl: result.product.thumbnailUrl,
      priceMin,
      priceMax,
      similarityScore: result.similarityScore,
    }
  }
}
