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

export type ChatResponse = {
  message: string
  products: SemanticProduct[]
  hasResults: boolean
  // Updated history (previous turns + this exchange) to send on the next turn
  history?: ChatHistoryMessage[]
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
  history: ChatHistoryMessage[]
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/search/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, sessionId, history }),
  })

  if (!res.ok) {
    throw new Error(`Chat failed with status ${res.status}`)
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
  onDelta: (text: string) => void
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/search/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, sessionId, history, stream: true }),
  })

  if (!res.ok || !res.body) {
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
