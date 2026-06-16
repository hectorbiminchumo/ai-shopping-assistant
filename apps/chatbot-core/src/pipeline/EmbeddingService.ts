import { EmbeddingError } from "../errors"
import type { IEmbeddingService } from "../interfaces"

// Wraps Voyage AI text embeddings. Implements IEmbeddingService so the rest
// of the pipeline never depends on the concrete provider (Open/Closed +
// Dependency Inversion) — swapping providers means a new class, not edits here.
export class EmbeddingService implements IEmbeddingService {
  async embedText(_text: string): Promise<number[]> {
    // TODO: call Voyage AI (voyage-3, 1024 dims) once the client is configured in config/ai.config.ts
    throw new EmbeddingError("Voyage AI client not configured yet")
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedText(text)))
  }
}
