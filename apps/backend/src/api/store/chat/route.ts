import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ChatLogger,
  ChatOrchestrator,
  EmbeddingService,
  LLMService,
  PromptAssembler,
  QueryParser,
  ResponseFormatter,
  RetrievalService,
} from "@dtc/chatbot-core"

let orchestrator: ChatOrchestrator | null = null

function getOrchestrator(): ChatOrchestrator {
  if (!orchestrator) {
    orchestrator = new ChatOrchestrator(
      new QueryParser(),
      new EmbeddingService(),
      new RetrievalService(),
      new PromptAssembler(),
      new LLMService(),
      new ResponseFormatter(),
      new ChatLogger(),
    )
  }
  return orchestrator
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { query, sessionId, history = [] } = req.body as {
    query: string
    sessionId?: string
    history?: { role: "user" | "assistant"; content: string }[]
  }

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" })
  }

  const session = {
    sessionId: sessionId ?? crypto.randomUUID(),
    history,
  }

  try {
    const response = await getOrchestrator().handle(query, session)
    return res.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("[chat/route] Pipeline error:", err)
    return res.status(500).json({ error: message })
  }
}
