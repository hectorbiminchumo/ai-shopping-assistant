import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  ChatbotError,
  ChatLogger,
  EmbeddingService,
  ImageEmbeddingService,
  ImageOrchestrator,
  ImageRetrievalService,
  LLMService,
  PromptAssembler,
  QueryParser,
  ResponseFormatter,
  RetrievalService,
} from "@dtc/chatbot-core"

// Mirrors the fields this handler reads off Express.Multer.File. Declared
// locally instead of relying on @types/multer's ambient Express.Request
// augmentation, which isn't reliably in scope under tsconfig.test.json
// (ts-jest's config for this file) — nothing this file imports touches the
// multer module itself.
interface UploadedImageFile {
  buffer: Buffer
  mimetype: string
  size: number
  originalname: string
}

const imageSearchBodySchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId must not be empty"),
  query: z.string().trim().min(1, "query must not be empty").optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const file = (req as MedusaRequest & { file?: UploadedImageFile }).file

  if (!file) {
    res.status(400).json({
      message: "Invalid request body",
      errors: ["image file is required"],
    })
    return
  }

  const parsed = imageSearchBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.issues.map((issue) => issue.message),
    })
    return
  }

  const orchestrator = new ImageOrchestrator(
    new QueryParser(),
    new ImageEmbeddingService(),
    new ImageRetrievalService(),
    new EmbeddingService(),
    new RetrievalService(),
    new PromptAssembler(),
    new LLMService(),
    new ResponseFormatter(),
    new ChatLogger()
  )

  const session = { sessionId: parsed.data.sessionId, history: [] }

  try {
    const response = await orchestrator.handle(file.buffer, parsed.data.query, session)
    res.status(200).json(response)
  } catch (err) {
    console.error("[POST /store/chat/image-search]", err)
    // Intentionally 500, not the 502 that /search/chat and /search/semantic
    // use for the same kind of pipeline failure — see apps/backend/README.md.
    const message = err instanceof ChatbotError ? err.message : "Image search failed"
    res.status(500).json({ message })
  }
}
