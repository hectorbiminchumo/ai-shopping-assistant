import { formatProductsForPrompt } from "../utils"
import type { ChatMessage, PromptContext } from "../types"

const HISTORY_TURNS = 6

// Builds the final prompt sent to the LLM: system instructions + retrieved
// product context + recent conversation history + the user's query.
export class PromptAssembler {
  assemble(context: PromptContext): string {
    const recentHistory = this.formatHistory(context.history)
    const productContext = formatProductsForPrompt(context.retrievedProducts)

    // Persona and recommendation rules live in LLMService's system prompt —
    // this only supplies the per-turn context (matches + history + query).
    return [
      "Catalog matches (ordered by relevance):",
      productContext || "(no matching products found)",
      "",
      recentHistory ? `Recent conversation:\n${recentHistory}` : "",
      `User: ${context.query.rawQuery}`,
    ]
      .filter(Boolean)
      .join("\n")
  }

  private formatHistory(history: ChatMessage[]): string {
    return history
      .slice(-HISTORY_TURNS)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
  }
}
