import { ChatbotError } from "../errors"
import type { ILLMService } from "../interfaces"
import { generateResponse } from "../lib/openai"

// Wraps the OpenAI chat completion call (gpt-4o-mini). Implements ILLMService
// so the orchestrator never depends on the concrete LLM provider.
export class LLMService implements ILLMService {
  async complete(prompt: string): Promise<string> {
    try {
      return await generateResponse(prompt)
    } catch (error: unknown) {
      if (error instanceof ChatbotError) {
        throw error
      }
      throw new ChatbotError("Error al generar la respuesta de OpenAI", error)
    }
  }

  async *stream(_prompt: string): AsyncIterable<string> {
    try {
      const full = await generateResponse(_prompt)
      // Emitir por frases para simular streaming gradual
      const parts = full.split(/(?<=[.!?])\s+/)
      for (const part of parts) {
        yield part
      }
    } catch (error: unknown) {
      if (error instanceof ChatbotError) throw error
      throw new ChatbotError("Error en streaming de OpenAI", error)
    }
  }
}
