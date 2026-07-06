import { meetsSimilarityThreshold } from "../utils"
import type { ChatResponse, ProductCard, RetrievalResult } from "../types"

// The LLM ends each reply with a "RECOMMENDED: 1, 3" trailer.
// Tolerates markdown bold (**), optional colon, trailing punctuation, and
// leading/trailing whitespace so minor LLM formatting quirks don't break parsing.
const RECOMMENDED_LINE = /\n?\s*\**RECOMMENDED:?\**\s*(none|[\d,\s]+?)[\.\*]*\s*$/i

// Formats the LLM's raw text reply + retrieved products into the
// structured ChatResponse the storefront renders (message + product cards).
// Only the products the LLM actually recommended become cards, so the cards
// never contradict the message (e.g. no cards under a clarifying question).
export class ResponseFormatter {
  format(llmMessage: string, retrieved: RetrievalResult[]): ChatResponse {
    // `retrieved` already arrives sorted by the Reranker (composite score).
    // Re-sorting here would misalign the RECOMMENDED indices the LLM emitted
    // (which are 1-based positions in the prompt, i.e. this same order).
    const { message, recommended, trailerFound } = this.extractRecommended(llmMessage, retrieved)

    // Three cases:
    //   trailer present + products     → hasResults = true  (show cards)
    //   trailer present + none         → hasResults = true  (clarifying question — show message, no cards)
    //   no trailer (nonconforming LLM) → fall back to similarity threshold
    const topScore = trailerFound
      ? 1
      : Math.max(0, ...retrieved.map((r) => r.similarityScore))

    return {
      message,
      products: recommended.map((r) => this.toProductCard(r)),
      hasResults: meetsSimilarityThreshold(topScore),
    }
  }

  private extractRecommended(
    llmMessage: string,
    retrieved: RetrievalResult[]
  ): { message: string; recommended: RetrievalResult[]; trailerFound: boolean } {
    const match = llmMessage.match(RECOMMENDED_LINE)

    if (!match) {
      // No trailer (nonconforming reply): fall back to the threshold filter
      return {
        message: llmMessage.trim(),
        recommended: retrieved.filter((r) => meetsSimilarityThreshold(r.similarityScore)),
        trailerFound: false,
      }
    }

    const message = llmMessage.slice(0, match.index).trim()
    if (match[1].trim().toLowerCase() === "none") {
      return { message, recommended: [], trailerFound: true }
    }

    const indices = [
      ...new Set(
        match[1]
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= retrieved.length)
      ),
    ]
    return { message, recommended: indices.map((n) => retrieved[n - 1]), trailerFound: true }
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
