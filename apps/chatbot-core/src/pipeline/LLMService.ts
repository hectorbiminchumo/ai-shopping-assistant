import { ChatbotError } from "../errors"
import type { ILLMService } from "../interfaces"

// Wraps the OpenAI chat completion call (gpt-4o-mini). Implements ILLMService
// so the orchestrator never depends on the concrete LLM provider.
export class LLMService implements ILLMService {
  async complete(_prompt: string): Promise<string> {
    // TODO: call OpenAI once the client is configured in config/ai.config.ts
    throw new ChatbotError("OpenAI client not configured yet")
  }

  async *stream(_prompt: string): AsyncIterable<string> {
    // TODO: call OpenAI streaming API once the client is configured
    throw new ChatbotError("OpenAI client not configured yet")
  }
}
