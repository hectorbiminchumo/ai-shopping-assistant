import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  ChatbotError,
  EmbeddingService,
  QueryParser,
  Reranker,
  RetrievalService,
  SearchOrchestrator,
} from "@dtc/chatbot-core"

const searchBodySchema = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = searchBodySchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.issues.map((issue) => issue.message),
    })
    return
  }

  const orchestrator = new SearchOrchestrator(
    new QueryParser(),
    new EmbeddingService(),
    new RetrievalService(),
    new Reranker()
  )

  try {
    const result = await orchestrator.search(parsed.data.query)
    res.status(200).json(result)
  } catch (err) {
    const message = err instanceof ChatbotError ? err.message : "Semantic search failed"
    res.status(502).json({ message })
  }
}
