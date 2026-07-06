import { detectAudience } from "../utils/audience"
import type { ParsedQuery } from "../types"

const PRICE_PATTERN = /(?:under|below|less than|menos de)\s*\$?(\d+)/i
const SIZE_PATTERN = /\bsize\s*(\d+(?:\.\d+)?)\b/i

// Categories are stored as slugs ("running-shoes") but users type plain
// words ("running shoes"): collapse separators before comparing.
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// Single responsibility: turn a raw user query into structured filters
// applied as SQL WHERE clauses before the vector search, plus the text
// that still gets embedded for semantic matching.
export class QueryParser {
  parse(rawQuery: string, knownCategories: string[] = []): ParsedQuery {
    const priceMatch = rawQuery.match(PRICE_PATTERN)
    const sizeMatch = rawQuery.match(SIZE_PATTERN)
    const normalizedQuery = normalize(rawQuery)
    const category = knownCategories.find((c) =>
      normalizedQuery.includes(normalize(c))
    )

    return {
      rawQuery,
      category,
      priceMax: priceMatch ? Number(priceMatch[1]) : undefined,
      size: sizeMatch ? sizeMatch[1] : undefined,
      audience: detectAudience(rawQuery),
    }
  }
}
