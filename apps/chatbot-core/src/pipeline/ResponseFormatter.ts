import { meetsSimilarityThreshold } from "../utils"
import type { ChatResponse, ProductCard, RetrievalResult } from "../types"

// The LLM ends each reply with a "RECOMMENDED: 1, 3" trailer.
// Tolerates markdown bold (**), optional colon, trailing punctuation, and
// leading/trailing whitespace so minor LLM formatting quirks don't break parsing.
const RECOMMENDED_LINE = /\n?\s*\**RECOMMENDED:?\**\s*(none|[\d,\s]+?)[\.\*]*\s*$/i

// Occasionally the LLM emits only the trailer with no prose before it,
// leaving an empty bubble in the storefront. Never show the user nothing.
const FALLBACK_MESSAGE =
  "Sorry, could you rephrase that? I didn't quite catch what you're looking for."

// Minimum fraction of a product title's significant words that must appear
// in the reply for it to count as "named in the text". Word-level, not exact
// substring: the LLM reliably names the right product but sometimes tweaks
// grammar (e.g. "ADIDAS Men Sports..." → "ADIDAS Men's Sports..."), which
// breaks a naive .includes() check over one differing word.
const TITLE_MATCH_THRESHOLD = 0.8

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
}

function isTitleMentioned(title: string, message: string): boolean {
  const titleWords = significantWords(title)
  if (titleWords.length === 0) return false
  const messageWords = new Set(significantWords(message))
  const matched = titleWords.filter((w) => messageWords.has(w)).length
  return matched / titleWords.length >= TITLE_MATCH_THRESHOLD
}

// Roughly "where is this product first mentioned in the text" — used to order
// recommendations the way the LLM presented them (its primary pick first),
// not the order they happened to rank in retrieval.
function firstMentionPosition(title: string, message: string): number {
  const [firstWord] = significantWords(title)
  if (!firstWord) return Number.MAX_SAFE_INTEGER
  const index = message.toLowerCase().indexOf(firstWord)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

// Guardrail against the LLM occasionally naming a cross-category "alternative"
// despite being told not to (e.g. a t-shirt offered as an alternative to a
// shoe request, sometimes even while admitting "it's a t-shirt, not a shoe").
// Anchor on the category of whichever product was named FIRST — the model's
// own primary pick — and drop anything recommended that doesn't match it.
function enforceSameCategory(recommended: RetrievalResult[]): RetrievalResult[] {
  if (recommended.length <= 1) return recommended
  const primaryCategory = recommended[0].product.category
  if (!primaryCategory) return recommended
  return recommended.filter((r) => r.product.category === primaryCategory)
}

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

    // Real retrieval confidence: the best score among what was ACTUALLY
    // recommended (not hardcoded to 1 like topScore above). A weak match the
    // LLM chose to recommend anyway should still count as a low-confidence
    // retrieval for analytics, even though the storefront still shows its card.
    const realTopScore =
      recommended.length > 0
        ? Math.max(...recommended.map((r) => r.similarityScore))
        : Math.max(0, ...retrieved.map((r) => r.similarityScore))

    return {
      message: message || FALLBACK_MESSAGE,
      products: recommended.map((r) => this.toProductCard(r)),
      hasResults: meetsSimilarityThreshold(topScore),
      similarityThresholdMet: meetsSimilarityThreshold(realTopScore),
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

    // Match products by whether their title is named in the prose, rather
    // than trusting the LLM's own numbering in the trailer. The system
    // prompt mandates exact titles in the text (reliable in practice), but
    // the model occasionally miscounts which index corresponds to which item
    // when writing the trailer — producing a card that contradicts what was
    // actually written (e.g. naming "Vans Men Khaki Shoes" in the text but
    // the trailer pointing at an unrelated t-shirt). Ordered by where each
    // product is first mentioned, so display order follows the prose (the
    // model's primary pick first), not retrieval/rerank order.
    const byTitle = retrieved
      .filter((r) => isTitleMentioned(r.product.title, message))
      .sort(
        (a, b) =>
          firstMentionPosition(a.product.title, message) -
          firstMentionPosition(b.product.title, message)
      )

    if (byTitle.length > 0) {
      return { message, recommended: enforceSameCategory(byTitle), trailerFound: true }
    }

    // Fallback: title match found nothing (e.g. the model paraphrased
    // instead of using the exact title) — use the trailer's own indices.
    const indices = [
      ...new Set(
        match[1]
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= retrieved.length)
      ),
    ]
    const byIndex = indices.map((n) => retrieved[n - 1])
    return { message, recommended: enforceSameCategory(byIndex), trailerFound: true }
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
