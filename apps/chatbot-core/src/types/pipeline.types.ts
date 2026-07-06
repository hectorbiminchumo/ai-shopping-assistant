import type { ChatMessage } from "./chat.types"
import type { Product } from "./product.types"

// Who the product is for — catalog titles carry the label ("Nike Women ...",
// "Puma Men ...", "Doodle Boy's ... Kidswear")
export type Audience = "men" | "women" | "children"

export interface ParsedQuery {
  rawQuery: string
  category?: string
  priceMax?: number
  size?: string
  audience?: Audience
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
