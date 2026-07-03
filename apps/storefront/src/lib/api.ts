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
