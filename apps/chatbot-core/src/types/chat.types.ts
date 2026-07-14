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
  // Whether the LLM produced a real reply (a recommendation or a clarifying
  // question) as opposed to the nonconforming-reply fallback. Drives the
  // storefront's card display — NOT a signal of retrieval confidence.
  hasResults: boolean
  // Whether the best product actually recommended clears SIMILARITY_THRESHOLD.
  // This is the real retrieval-confidence signal and is what chat_logs.has_results
  // (lost-sale tracking) should be based on — hasResults stays true even for a
  // weak match the LLM chose to recommend anyway.
  similarityThresholdMet: boolean
  // Updated conversation history (previous turns + this exchange, trimmed to
  // the prompt window) so the client can send it back on the next request.
  // Optional: only the conversational path (ChatOrchestrator) provides it.
  history?: ChatMessage[]
  // Active filters after merging explicit overrides with inferred ones.
  // Only the fields that were actually applied are included.
  // The frontend uses this to render active-filter tags.
  appliedFilters?: ExplicitFilters
}

// Emitted by ChatOrchestrator.handleStream(): "delta" chunks arrive as the
// LLM generates its reply (for a live-typing effect), and the final "done"
// event carries the fully formatted ChatResponse — which supersedes whatever
// partial text the client displayed, since the RECOMMENDED trailer can only
// be parsed once the full reply is known.
export type ChatStreamEvent = { type: "delta"; text: string } | { type: "done"; response: ChatResponse }
