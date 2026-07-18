import { getSupabaseClient } from "../config"
import type { IEmbeddingService, IImageEmbeddingService } from "../interfaces"
import type { Product } from "../types"
import { ChunkBuilder } from "./ChunkBuilder"

// Generates text embeddings (Voyage AI voyage-3) and, when an image embedding
// service is provided, image embeddings (voyage-multimodal-3.5, 512d) from the
// product thumbnail — upserting both into Supabase product_embeddings.
export class EmbeddingIndexer {
  constructor(
    private readonly embeddingService: IEmbeddingService,
    private readonly chunkBuilder: ChunkBuilder,
    // Optional so text-only ingestion keeps working unchanged; image ingestion
    // (Feature 2) injects it. Depends on the abstraction, not the provider.
    private readonly imageEmbeddingService?: IImageEmbeddingService,
    // Injectable so tests can stub the image download without hitting the network.
    private readonly fetchImage: (url: string) => Promise<Buffer> = defaultFetchImage
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

  // Downloads the product image and stores its 512d CLIP-style embedding in the
  // existing product_embeddings row. Runs independently of text indexing so
  // images can be (re)indexed without regenerating text embeddings.
  async indexProductImage(product: Product): Promise<void> {
    if (!this.imageEmbeddingService) {
      throw new Error("No image embedding service configured")
    }
    if (!product.thumbnailUrl) {
      throw new Error(`Product "${product.title}" has no thumbnail URL`)
    }

    const image = await this.fetchImage(product.thumbnailUrl)
    const imageEmbedding = await this.imageEmbeddingService.embedImage(image)

    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from("product_embeddings")
      .update({ image_embedding: imageEmbedding, updated_at: new Date().toISOString() })
      .eq("medusa_product_id", product.medusaProductId)

    if (error) {
      throw new Error(`Supabase image update failed for "${product.title}": ${error.message}`)
    }
  }
}

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed: ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}
