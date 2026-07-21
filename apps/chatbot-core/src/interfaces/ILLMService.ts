import type { ChatMessage, RetrievalResult } from "../types"

export interface ILLMService {
  generateResponse(query: string, products: RetrievalResult[]): Promise<string>
  // Rewrites a follow-up message ("for women") into a standalone search query
  // ("gym shoes for women") using the conversation history. Best-effort:
  // returns the original query when there is no history or the call fails.
  condenseQuery(query: string, history: ChatMessage[]): Promise<string>
  complete(prompt: string): Promise<string>
  // Like complete(), but framed by the image-search system prompt (the query is
  // a photo, so the assistant presents the visual matches instead of asking).
  completeImageSearch(prompt: string): Promise<string>
  stream(prompt: string): AsyncIterable<string>
}
