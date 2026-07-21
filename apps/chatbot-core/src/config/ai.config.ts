import OpenAI from "openai"
import { VoyageAIClient } from "voyageai"

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  voyageApiKey: process.env.VOYAGE_API_KEY || "",
  voyageModel: process.env.VOYAGE_MODEL || "voyage-3",
  // Image embeddings (voyage-multimodal-3.5 @512d, called over REST — the
  // installed voyageai SDK v0.0.4 has no output_dimension param). Required, no
  // hardcoded default: set both in .env (see .env.example). Validated in
  // ImageEmbeddingService before use. imageEmbeddingDimensions is fixed by the
  // image_embedding vector(512) column, not env-configurable.
  voyageMultimodalModel: process.env.VOYAGE_MULTIMODAL_MODEL || "",
  voyageApiBaseUrl: process.env.VOYAGE_API_BASE_URL || "",
  imageEmbeddingDimensions: 512,
}

export function getOpenAiClient(): OpenAI {
  if (!aiConfig.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }
  return new OpenAI({ apiKey: aiConfig.openaiApiKey })
}

export function getVoyageClient(): VoyageAIClient {
  if (!aiConfig.voyageApiKey) {
    throw new Error("VOYAGE_API_KEY is not set")
  }
  return new VoyageAIClient({ apiKey: aiConfig.voyageApiKey })
}
