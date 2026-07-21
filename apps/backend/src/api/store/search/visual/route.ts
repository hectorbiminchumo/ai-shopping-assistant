import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  ChatbotError,
  ImageRetrievalService,
  VisualSearchOrchestrator,
} from "@dtc/chatbot-core"

// Field names are spelled out in every message: zod's defaults for a missing
// key ("expected string, received undefined") don't say which key, and these
// strings are what the API consumer sees in the 400 body.
// topK is capped so a caller cannot ask for the whole catalog in one request.
const visualSearchBodySchema = z.object({
  productId: z
    .string({ error: "productId is required and must be a string" })
    .trim()
    .min(1, "productId must not be empty"),
  topK: z
    .number({ error: "topK must be a number" })
    .int("topK must be an integer")
    .min(1, "topK must be at least 1")
    .max(20, "topK must be at most 20")
    .optional(),
})

// Visual "more like this" for the product detail page: takes a catalog product
// and returns the most visually similar ones. Unlike /store/chat/image-search
// there is no upload and no LLM — the product's already-indexed embedding is
// the query, so the response is pure similarity and costs no Voyage call.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = visualSearchBodySchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request body",
      errors: parsed.error.issues.map((issue) => issue.message),
    })
    return
  }

  const orchestrator = new VisualSearchOrchestrator(new ImageRetrievalService())

  try {
    const result = await orchestrator.search(parsed.data.productId, parsed.data.topK)

    // null = the product is unknown or has no image embedding, which is a
    // different answer from "nothing looks like it" (200 with hasResults false).
    if (!result) {
      res.status(404).json({ message: "Product has no indexed image" })
      return
    }

    res.status(200).json(result)
  } catch (err) {
    console.error("[POST /store/search/visual]", err)
    const message = err instanceof ChatbotError ? err.message : "Visual search failed"
    res.status(500).json({ message })
  }
}
