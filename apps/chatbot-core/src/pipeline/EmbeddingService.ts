import { getVoyageClient, aiConfig } from "../config"
import { EmbeddingError } from "../errors"
import type { IEmbeddingService } from "../interfaces"

export class EmbeddingService implements IEmbeddingService {
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.withRetry(() =>
        getVoyageClient().embed({ input: [text], model: aiConfig.voyageModel })
      )
      const embedding = response.data?.[0]?.embedding
      if (!embedding) throw new EmbeddingError("Empty embedding response from Voyage AI")
      return embedding
    } catch (err) {
      if (err instanceof EmbeddingError) throw err
      throw new EmbeddingError("Failed to generate embedding", err)
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.withRetry(() =>
        getVoyageClient().embed({ input: texts, model: aiConfig.voyageModel })
      )
      const data = response.data
      if (!data) throw new EmbeddingError("Empty batch response from Voyage AI")
      return data.map((d) => {
        if (!d.embedding) throw new EmbeddingError("Missing embedding in batch response")
        return d.embedding
      })
    } catch (err) {
      if (err instanceof EmbeddingError) throw err
      throw new EmbeddingError("Failed to generate batch embeddings", err)
    }
  }

  // Transient Voyage AI failures (rate limits, brief network blips) are common
  // on the free tier. Retry a couple of times with backoff before giving up —
  // kept short since this runs in the live chat request path, not batch
  // ingestion (which has its own longer retry in scripts/ingest-products.mjs).
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 150): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt))
        }
      }
    }
    throw lastErr
  }
}
