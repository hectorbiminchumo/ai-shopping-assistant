import { getSupabaseClient } from "../config"
import type { IEmbeddingService } from "../interfaces"
import type { Product } from "../types"
import { ChunkBuilder } from "./ChunkBuilder"

// Generates text embeddings (Voyage AI) and upserts the product row into
// Supabase product_embeddings. image_embedding (voyage-multimodal-3) is left
// null until the image search feature is wired up.
export class EmbeddingIndexer {
  constructor(
    private readonly embeddingService: IEmbeddingService,
    private readonly chunkBuilder: ChunkBuilder
  ) {}

  async indexProduct(product: Product): Promise<void> {
    const chunk = this.chunkBuilder.build(product)
    const embedding = await this.embeddingService.embedText(chunk)

    const prices = product.variants.map((v) => v.price).filter((p) => p > 0)
    const priceMin = prices.length > 0 ? Math.min(...prices) : null
    const priceMax = prices.length > 0 ? Math.max(...prices) : null

    const availableSizes = [
      ...new Set(
        product.variants
          .map((v) => v.options.size)
          .filter((s): s is string => Boolean(s))
      ),
    ]

    const supabase = getSupabaseClient()
    const { error } = await supabase.from("product_embeddings").upsert(
      {
        medusa_product_id: product.medusaProductId,
        title: product.title,
        description: product.description,
        category: product.category ?? null,
        tags: product.tags,
        available_sizes: availableSizes.length > 0 ? availableSizes : null,
        price_min: priceMin,
        price_max: priceMax,
        thumbnail_url: product.thumbnailUrl ?? null,
        embedding,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "medusa_product_id" }
    )

    if (error) throw new Error(`Supabase upsert failed for "${product.title}": ${error.message}`)
  }
}
