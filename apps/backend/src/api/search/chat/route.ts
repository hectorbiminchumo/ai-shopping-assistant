import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  ChatbotError,
  ChatLogger,
  ChatOrchestrator,
  EmbeddingService,
  LLMService,
  PromptAssembler,
  QueryParser,
  Reranker,
  ResponseFormatter,
  RetrievalService,
} from "@dtc/chatbot-core"

const filtersSchema = z
  .object({
    category: z.string().optional(),
    priceMin: z.number().nonnegative("priceMin must be a non-negative number").optional(),
    priceMax: z.number().nonnegative("priceMax must be a non-negative number").optional(),
    size: z
      .string()
      .trim()
      .min(1, "size must not be empty")
      .max(20, "size is too long")
      .regex(/^[A-Za-z0-9.\-/ ]+$/, "size contains invalid characters")
      .optional(),
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
  stream: z.boolean().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = chatBodySchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.issues.map((issue) => issue.message),
    })
    return
  }

  const retrievalService = new RetrievalService()

  const filterCategory = parsed.data.filters?.category
  if (filterCategory) {
    const knownCategories = await retrievalService.listCategories()
    if (knownCategories.length > 0 && !knownCategories.includes(filterCategory)) {
      res.status(400).json({
        message: "Invalid request body",
        errors: [`Unknown category: "${filterCategory}"`],
      })
      return
    }
  }

  const orchestrator = new ChatOrchestrator(
    new QueryParser(),
    new EmbeddingService(),
    retrievalService,
    new Reranker(),
    new PromptAssembler(),
    new LLMService(),
    new ResponseFormatter(),
    new ChatLogger()
  )

  const session = { sessionId: parsed.data.sessionId, history: parsed.data.history ?? [] }

  if (!parsed.data.stream) {
    try {
      const response = await orchestrator.handle(parsed.data.query, session, parsed.data.filters)
      res.status(200).json(response)
    } catch (err) {
      console.error("[POST /search/chat]", err)
      const message = err instanceof ChatbotError ? err.message : "Chat failed"
      res.status(502).json({ message })
    }
    return
  }

  // Streaming path: newline-delimited JSON over a chunked response. Each line
  // is one ChatStreamEvent ({"type":"delta"} | {"type":"done"}) from the
  // orchestrator, plus a transport-only {"type":"error"} if the pipeline
  // fails after streaming has already started (headers are already sent by
  // then, so a normal error status response is no longer possible).
  res.status(200)
  res.setHeader("Content-Type", "application/x-ndjson")
  res.flushHeaders()

  try {
    for await (const event of orchestrator.handleStream(
      parsed.data.query,
      session,
      parsed.data.filters
    )) {
      res.write(JSON.stringify(event) + "\n")
    }
  } catch (err) {
    console.error("[POST /search/chat] stream", err)
    const message = err instanceof ChatbotError ? err.message : "Chat failed"
    res.write(JSON.stringify({ type: "error", message }) + "\n")
  } finally {
    res.end()
  }
}
