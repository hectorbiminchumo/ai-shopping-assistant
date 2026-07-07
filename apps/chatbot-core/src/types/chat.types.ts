import type { ProductCard } from "./product.types"

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
}
