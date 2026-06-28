import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  EmbeddingService,
  QueryParser,
  RetrievalService,
} from "@dtc/chatbot-core"

const TOP_K = 10

let embeddingService: EmbeddingService | null = null
let retrievalService: RetrievalService | null = null
let queryParser: QueryParser | null = null

function getServices() {
  if (!embeddingService) embeddingService = new EmbeddingService()
  if (!retrievalService) retrievalService = new RetrievalService()
  if (!queryParser) queryParser = new QueryParser()
  return { embeddingService, retrievalService, queryParser }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { query, category, priceMax } = req.body as {
    query?: string
    category?: string
    priceMax?: number
  }

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" })
  }

  try {
    const { embeddingService, retrievalService, queryParser } = getServices()

    const embedding = await embeddingService.embedText(query)

    const parsedQuery = queryParser.parse(query)
    if (category) parsedQuery.category = category
    if (priceMax != null) parsedQuery.priceMax = priceMax

    const retrieved = await retrievalService.search(embedding, parsedQuery, TOP_K)

    const results = retrieved.map((r) => ({
      ...r.product,
      similarityScore: r.similarityScore,
    }))

    return res.json({ results, count: results.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed"
    console.error("[search/semantic] Error:", err)
    return res.status(500).json({ error: message })
  }
}
