import type { ChatMessage } from "./chat.types"
import type { Product } from "./product.types"

// Who the product is for — catalog titles carry the label ("Nike Women ...",
// "Puma Men ...", "Doodle Boy's ... Kidswear")
export type Audience = "men" | "women" | "children"

// Filters sent explicitly by the client (UI filter panel). These override
// the same fields inferred by QueryParser from the natural-language query.
export interface ExplicitFilters {
  category?: string
  priceMin?: number
  priceMax?: number
  size?: string
}

export interface ParsedQuery {
  rawQuery: string
  // Same text as rawQuery with matched filter phrases (price, size) removed —
  // use this for embedding. Those phrases are applied as SQL WHERE clauses
  // via priceMin/priceMax/size below; leaving them in the embedded text also
  // shifts the semantic ranking unpredictably (e.g. "under $115" pulling in
  // different products than the same search without that phrase), even
  // though the price cutoff should only ever be a hard filter.
  embeddingText: string
  category?: string
  priceMin?: number
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
