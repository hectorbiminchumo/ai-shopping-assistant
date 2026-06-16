import { ChatbotError } from "./ChatbotError"

export class EmbeddingError extends ChatbotError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = "EmbeddingError"
  }
}
