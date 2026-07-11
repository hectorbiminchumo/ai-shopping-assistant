import type { ProductCard } from "./product.types"
import type { ExplicitFilters } from "./pipeline.types"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatSession {
  sessionId: string
  userId?: string
  history: ChatMessage[]
}

export interface ChatResponse {
  message: string
  products: ProductCard[]
  hasResults: boolean
  // Updated conversation history (previous turns + this exchange, trimmed to
  // the prompt window) so the client can send it back on the next request.
  // Optional: only the conversational path (ChatOrchestrator) provides it.
  history?: ChatMessage[]
  // Active filters after merging explicit overrides with inferred ones.
  // Only the fields that were actually applied are included.
  // The frontend uses this to render active-filter tags.
  appliedFilters?: ExplicitFilters
}
