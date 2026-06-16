import type { ChatMessage } from "./chat.types"
import type { Product } from "./product.types"

export interface ParsedQuery {
  rawQuery: string
  category?: string
  priceMax?: number
  size?: string
}

export interface RetrievalResult {
  product: Product
  similarityScore: number
}

export interface PromptContext {
  query: ParsedQuery
  retrievedProducts: RetrievalResult[]
  history: ChatMessage[]
}
