import { ChatbotError } from "./ChatbotError"

export class RetrievalError extends ChatbotError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = "RetrievalError"
  }
}
