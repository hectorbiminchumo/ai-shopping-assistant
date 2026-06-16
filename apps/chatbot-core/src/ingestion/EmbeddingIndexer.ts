import type { IEmbeddingService } from "../interfaces"
import type { Product } from "../types"
import { ChunkBuilder } from "./ChunkBuilder"

// Generates text embeddings (Voyage AI) and CLIP image embeddings for each
// product, then upserts them into Supabase product_embeddings.
export class EmbeddingIndexer {
  constructor(
    private readonly embeddingService: IEmbeddingService,
    private readonly chunkBuilder: ChunkBuilder
  ) {}

  async indexProduct(product: Product): Promise<void> {
    const chunk = this.chunkBuilder.build(product)
    await this.embeddingService.embedText(chunk)
    // TODO: also generate the CLIP image embedding and upsert both into Supabase pgvector
    throw new Error("Supabase client not configured yet")
  }
}
