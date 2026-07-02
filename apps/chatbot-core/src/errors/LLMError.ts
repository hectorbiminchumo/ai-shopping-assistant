import { ChatbotError } from "./ChatbotError"

export class LLMError extends ChatbotError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = "LLMError"
  }
}
