// Client for the AI backend (Medusa custom routes backed by chatbot-core).
// Kept separate from lib/config.ts: these routes are called with plain fetch
// rather than the Medusa SDK. Most of them (/search/*) sit outside /store and
// need no publishable key; image search is the exception — see searchImage.

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
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

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

// Image search is the one endpoint here that DOES sit under /store, so unlike
// the /search/* routes above it needs the publishable key — without it Medusa
// rejects the request with a 400 before the route ever runs.
//
// `query` is optional and drives hybrid retrieval: with text the backend blends
// 0.6·image + 0.4·text, without it the search stays purely visual. It must be
// omitted rather than sent empty — the route's schema rejects a blank string.
export async function searchImage(
  file: File,
  sessionId: string,
  query?: string
): Promise<ChatResponse> {
  const body = new FormData()
  body.append("image", file)
  body.append("sessionId", sessionId)
  const trimmedQuery = query?.trim()
  if (trimmedQuery) body.append("query", trimmedQuery)

  const res = await fetch(`${API_URL}/store/chat/image-search`, {
    method: "POST",
    headers: PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : undefined,
    body,
  })

  if (!res.ok) {
    throw new Error(`Image search failed with status ${res.status}`)
  }

  return res.json()
}

type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; message: string }

// Same conversational endpoint as chat(), but consumes the streamed reply:
// onDelta fires as prose arrives (live-typing effect); the returned promise
// resolves with the final formatted response once the stream's "done" event
// arrives (product cards can only be known once the full reply is parsed).
export async function chatStream(
  query: string,
  sessionId: string,
  history: ChatHistoryMessage[],
  filters: ChatFilters | undefined,
  onDelta: (text: string) => void
): Promise<ChatResponse> {
  const hasFilters = filters && Object.values(filters).some((v) => v !== undefined)
  const res = await fetch(`${API_URL}/search/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      sessionId,
      history,
      stream: true,
      ...(hasFilters ? { filters } : {}),
    }),
  })

  if (!res.ok || !res.body) {
    // 400 = the backend rejected the filters, same as chat() — validation
    // happens before any streaming starts, so this is still a plain JSON body.
    if (res.status === 400) {
      const body = await res.json().catch(() => null)
      const detail = Array.isArray(body?.errors) ? body.errors.join(", ") : null
      throw new ChatFiltersError(detail ?? "Invalid filters")
    }
    throw new Error(`Chat failed with status ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalResponse: ChatResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      const event: ChatStreamEvent = JSON.parse(line)

      if (event.type === "delta") onDelta(event.text)
      else if (event.type === "done") finalResponse = event.response
      else throw new Error(event.message)
    }
  }

  if (!finalResponse) throw new Error("Chat stream ended without a final response")
  return finalResponse
}