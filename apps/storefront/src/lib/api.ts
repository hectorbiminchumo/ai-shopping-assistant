// Client for the AI backend (Medusa custom routes backed by chatbot-core).
// Kept separate from lib/config.ts: these routes sit outside /store, so they
// don't need the Medusa SDK or the publishable key.

export type SemanticProduct = {
  id: string
  medusaProductId: string
  title: string
  thumbnailUrl?: string
  priceMin: number
  priceMax: number
  similarityScore: number
}

export type SemanticSearchResponse = {
  products: SemanticProduct[]
  hasResults: boolean
}

export type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

// Explicit filters accepted by POST /search/chat. Category must be one of
// the catalog categories (the backend rejects unknown values with a 400).
export type ChatFilters = {
  category?: string
  priceMin?: number
  priceMax?: number
  size?: string
}

export type ChatResponse = {
  message: string
  products: SemanticProduct[]
  hasResults: boolean
  // Updated history (previous turns + this exchange) to send on the next turn
  history?: ChatHistoryMessage[]
  // Filters the backend actually applied (explicit + inferred from the query)
  appliedFilters?: ChatFilters
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9000"

export async function search(
  query: string,
  topK?: number
): Promise<SemanticSearchResponse> {
  const res = await fetch(`${API_URL}/search/semantic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(topK ? { query, topK } : { query }),
  })

  if (!res.ok) {
    throw new Error(`Semantic search failed with status ${res.status}`)
  }

  return res.json()
}

// Conversational endpoint: same retrieval as search(), plus an LLM-written
// reply. History lets the assistant keep context across turns.
export async function chat(
  query: string,
  sessionId: string,
  history: ChatHistoryMessage[],
  filters?: ChatFilters
): Promise<ChatResponse> {
  const hasFilters = filters && Object.values(filters).some((v) => v !== undefined)
  const res = await fetch(`${API_URL}/search/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      sessionId,
      history,
      ...(hasFilters ? { filters } : {}),
    }),
  })

  if (!res.ok) {
    // 400 = the backend rejected the filters (e.g. a catalog category that
    // isn't in the embedding index) — surface it so the chat can explain
    // instead of showing the generic error.
    if (res.status === 400) {
      const body = await res.json().catch(() => null)
      const detail = Array.isArray(body?.errors) ? body.errors.join(", ") : null
      throw new ChatFiltersError(detail ?? "Invalid filters")
    }
    throw new Error(`Chat failed with status ${res.status}`)
  }

  return res.json()
}

export class ChatFiltersError extends Error {}
