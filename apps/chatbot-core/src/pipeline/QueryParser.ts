import { detectAudience } from "../utils/audience"
import type { ParsedQuery } from "../types"

const PRICE_MAX_PATTERN = /(?:under|below|less than|menos de)\s*\$?(\d+)/i
const PRICE_MIN_PATTERN = /(?:above|over|more than|at least|desde|más de)\s*\$?(\d+)/i
const SIZE_PATTERN = /\bsize\s*(\d+(?:\.\d+)?)\b/i

// Categories are stored as slugs ("running-shoes") but users type plain
// words ("running shoes"): collapse separators before comparing.
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// Loose stem match so "run" ≈ "running" and "shoe" ≈ "shoes". Requiring at
// least 3 characters keeps short words from matching everything.
function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true
  return (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))
}

// A category applies when EVERY word of its name appears (stemmed, any
// order) in the query: "women shoes for run" → "running-shoes".
function matchesCategory(queryTokens: string[], category: string): boolean {
  return normalize(category)
    .split(" ")
    .every((catToken) => queryTokens.some((qt) => stemsMatch(qt, catToken)))
}

// Single responsibility: turn a raw user query into structured filters
// applied as SQL WHERE clauses before the vector search, plus the text
// that still gets embedded for semantic matching.
export class QueryParser {
  parse(rawQuery: string, knownCategories: string[] = []): ParsedQuery {
    const priceMaxMatch = rawQuery.match(PRICE_MAX_PATTERN)
    const priceMinMatch = rawQuery.match(PRICE_MIN_PATTERN)
    const sizeMatch = rawQuery.match(SIZE_PATTERN)
    const queryTokens = normalize(rawQuery).split(" ")
    const category = knownCategories.find((c) => matchesCategory(queryTokens, c))

    return {
      rawQuery,
      category,
      priceMin: priceMinMatch ? Number(priceMinMatch[1]) : undefined,
      priceMax: priceMaxMatch ? Number(priceMaxMatch[1]) : undefined,
      size: sizeMatch ? sizeMatch[1] : undefined,
      audience: detectAudience(rawQuery),
    }
  }
}
