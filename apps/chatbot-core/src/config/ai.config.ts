import { VoyageAIClient } from "voyageai"
import OpenAI from "openai"

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  voyageApiKey: process.env.VOYAGE_API_KEY || "",
  voyageModel: process.env.VOYAGE_MODEL || "voyage-3",
}

let _voyageClient: VoyageAIClient | null = null
let _openaiClient: OpenAI | null = null

export function getVoyageClient(): VoyageAIClient {
  if (!aiConfig.voyageApiKey) {
    throw new Error("VOYAGE_API_KEY is not set")
  }
  if (!_voyageClient) _voyageClient = new VoyageAIClient({ apiKey: aiConfig.voyageApiKey })
  return _voyageClient
}

export function getOpenAiClient(): OpenAI {
  if (!aiConfig.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }
  if (!_openaiClient) _openaiClient = new OpenAI({ apiKey: aiConfig.openaiApiKey })
  return _openaiClient
}
