import { VoyageAIClient } from "voyageai"
import OpenAI from "openai"

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  voyageApiKey: process.env.VOYAGE_API_KEY || "",
  voyageModel: process.env.VOYAGE_MODEL || "voyage-3",
}

export function getVoyageClient(): VoyageAIClient {
  if (!aiConfig.voyageApiKey) {
    throw new Error("VOYAGE_API_KEY is not set")
  }
  return new VoyageAIClient({ apiKey: aiConfig.voyageApiKey })
}

export function getOpenAiClient(): OpenAI {
  if (!aiConfig.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }
  return new OpenAI({ apiKey: aiConfig.openaiApiKey })
}
