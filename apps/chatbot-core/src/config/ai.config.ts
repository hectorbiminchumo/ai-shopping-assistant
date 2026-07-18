import OpenAI from "openai"
import { VoyageAIClient } from "voyageai"

export const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  voyageApiKey: process.env.VOYAGE_API_KEY || "",
  voyageModel: process.env.VOYAGE_MODEL || "voyage-3",
  // Image embeddings. voyage-multimodal-3.5 supports Matryoshka output
  // dimensions (256/512/1024/2048); we request 512 to fit the existing
  // product_embeddings.image_embedding vector(512) column. Called over REST
  // (the installed voyageai SDK v0.0.4 has no output_dimension param), so the
  // endpoint is configurable too.
  voyageMultimodalModel: process.env.VOYAGE_MULTIMODAL_MODEL || "voyage-multimodal-3.5",
  voyageApiBaseUrl: process.env.VOYAGE_API_BASE_URL || "https://api.voyageai.com/v1",
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
