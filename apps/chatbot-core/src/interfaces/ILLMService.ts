import type { RetrievalResult } from "../types"

export interface ILLMService {
  generateResponse(query: string, products: RetrievalResult[]): Promise<string>
  complete(prompt: string): Promise<string>
  stream(prompt: string): AsyncIterable<string>
}
