import { formatProductsForPrompt } from "../utils"
import type { ChatMessage, ParsedQuery, PromptContext } from "../types"

// W3 spec: keep the last 10 turns to stay within token limits. Shared with
// ChatOrchestrator so the returned history uses the same window.
export const HISTORY_TURNS = 10

// Builds the final prompt sent to the LLM: system instructions + retrieved
// product context + recent conversation history + the user's query.
export class PromptAssembler {
  assemble(context: PromptContext): string {
    const recentHistory = this.formatHistory(context.history)
    const productContext = formatProductsForPrompt(context.retrievedProducts)
    const activeFilters = this.formatFilters(context.query)

    // Persona and recommendation rules live in LLMService's system prompt —
    // this only supplies the per-turn context (matches + history + query).
    // The filter note sits with the other context lines and stays a single
    // sentence on purpose: hoisted to the top as a headed, upper-case block it
    // read as copy to reproduce, and the model pasted it into its reply.
    return [
      "Catalog matches (ordered by relevance):",
      productContext || "(no matching products found)",
      "",
      context.query.audience ? `Audience already specified: ${context.query.audience}` : "",
      activeFilters ? `Filters already applied to those matches: ${activeFilters}` : "",
      recentHistory ? `Recent conversation:\n${recentHistory}` : "",
      `User: ${context.query.rawQuery}`,
    ]
      .filter(Boolean)
      .join("\n")
  }

  // Hard constraints applied as SQL WHERE clauses before the vector search, so
  // the matches have already been narrowed by them. The LLM needs to see them
  // because some arrive from the storefront's filter panel rather than the
  // user's message: a price floor left over from an earlier turn can silently
  // exclude the entire product type just asked for, and without this block the
  // assistant has no way to explain why the results look unrelated.
  //
  // Each constraint spells out what it REMOVED rather than naming the field.
  // A terse "minimum price $150" was read as a filter on the query's own words
  // ("the active filter for black options"), producing a confidently wrong
  // explanation; stating the exclusion leaves nothing to infer.
  private formatFilters(query: ParsedQuery): string {
    const parts: string[] = []
    if (query.category) {
      parts.push(`category locked to "${query.category}" (every other category excluded)`)
    }
    if (query.priceMin !== undefined) {
      parts.push(`price floor $${query.priceMin} (every product under $${query.priceMin} excluded, whatever its type)`)
    }
    if (query.priceMax !== undefined) {
      parts.push(`price ceiling $${query.priceMax} (every product over $${query.priceMax} excluded, whatever its type)`)
    }
    if (query.size) {
      parts.push(`size "${query.size}" in stock (products without it excluded)`)
    }
    if (!parts.length) return ""

    return `${parts.join("; ")} — set in the storefront filter panel, possibly on an earlier turn.`
  }

  private formatHistory(history: ChatMessage[]): string {
    return history
      .slice(-HISTORY_TURNS)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
  }
}
