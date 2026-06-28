import { ChatbotError } from "../errors"
import type { ILLMService } from "../interfaces"
import { generateResponse, streamResponse } from "../lib/openai"

export class LLMService implements ILLMService {
  async complete(prompt: string): Promise<string> {
    try {
      return await generateResponse(prompt)
    } catch (error: unknown) {
      if (error instanceof ChatbotError) throw error
      throw new ChatbotError("Error al generar la respuesta de OpenAI", error)
    }
  }

  async *stream(prompt: string): AsyncIterable<string> {
    try {
      yield* streamResponse(prompt)
    } catch (error: unknown) {
      if (error instanceof ChatbotError) throw error
      throw new ChatbotError("Error en streaming de OpenAI", error)
    }
  }
}
