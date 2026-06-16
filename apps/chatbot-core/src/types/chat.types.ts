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
}
