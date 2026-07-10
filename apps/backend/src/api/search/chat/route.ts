import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  ChatbotError,
  ChatOrchestrator,
  EmbeddingService,
  LLMService,
  PromptAssembler,
  QueryParser,
  Reranker,
  ResponseFormatter,
  RetrievalService,
} from "@dtc/chatbot-core"
import type { IChatLogger } from "@dtc/chatbot-core"

const filtersSchema = z
  .object({
    category: z.string().optional(),
    priceMin: z.number().nonnegative("priceMin must be a non-negative number").optional(),
    priceMax: z.number().nonnegative("priceMax must be a non-negative number").optional(),
    size: z.string().optional(),
  })
  .refine(
    (f) => f.priceMin === undefined || f.priceMax === undefined || f.priceMin <= f.priceMax,
    { message: "priceMin must be less than or equal to priceMax" }
  )

const chatBodySchema = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
  sessionId: z.string().trim().min(1, "sessionId must not be empty"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
  filters: filtersSchema.optional(),
})

// chat_logs analytics are skipped until the Supabase client is configured
// (ChatLogger currently throws). Swap this for ChatLogger once it's wired.
class NoopChatLogger implements IChatLogger {
  async log(): Promise<void> {}
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = chatBodySchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.issues.map((issue) => issue.message),
    })
    return
  }

  const orchestrator = new ChatOrchestrator(
    new QueryParser(),
    new EmbeddingService(),
    new RetrievalService(),
    new Reranker(),
    new PromptAssembler(),
    new LLMService(),
    new ResponseFormatter(),
    new NoopChatLogger()
  )

  try {
    const response = await orchestrator.handle(
      parsed.data.query,
      { sessionId: parsed.data.sessionId, history: parsed.data.history ?? [] },
      parsed.data.filters
    )
    res.status(200).json(response)
  } catch (err) {
    const message = err instanceof ChatbotError ? err.message : "Chat failed"
    res.status(502).json({ message })
  }
}
