import type { ChatMessage, RetrievalResult } from "../types"

export interface ILLMService {
  generateResponse(query: string, products: RetrievalResult[]): Promise<string>
  // Rewrites a follow-up message ("for women") into a standalone search query
  // ("gym shoes for women") using the conversation history. Best-effort:
  // returns the original query when there is no history or the call fails.
  condenseQuery(query: string, history: ChatMessage[]): Promise<string>
  complete(prompt: string): Promise<string>
  stream(prompt: string): AsyncIterable<string>
}
