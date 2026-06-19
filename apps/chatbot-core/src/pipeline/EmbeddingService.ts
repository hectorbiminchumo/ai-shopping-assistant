import { getVoyageClient, aiConfig } from "../config"
import { EmbeddingError } from "../errors"
import type { IEmbeddingService } from "../interfaces"

export class EmbeddingService implements IEmbeddingService {
  async embedText(text: string): Promise<number[]> {
    try {
      const client = getVoyageClient()
      const response = await client.embed({ input: [text], model: aiConfig.voyageModel })
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
      const client = getVoyageClient()
      const response = await client.embed({ input: texts, model: aiConfig.voyageModel })
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
}
