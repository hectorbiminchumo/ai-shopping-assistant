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

// TODO: instantiate the real Voyage AI client once the SDK/API wrapper is added
export function getVoyageClient(): never {
  throw new Error("Voyage AI client not configured yet")
}
