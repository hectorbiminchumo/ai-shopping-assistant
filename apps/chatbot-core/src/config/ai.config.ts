import { VoyageAIClient } from "voyageai"

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  voyageApiKey: process.env.VOYAGE_API_KEY || "",
  voyageModel: process.env.VOYAGE_MODEL || "voyage-3",
}

// TODO: instantiate the real OpenAI client once the `openai` SDK is added
export function getOpenAiClient(): never {
  throw new Error("OpenAI client not configured yet")
}

export function getVoyageClient(): VoyageAIClient {
  if (!aiConfig.voyageApiKey) {
    throw new Error("VOYAGE_API_KEY is not set")
  }
  return new VoyageAIClient({ apiKey: aiConfig.voyageApiKey })
}
