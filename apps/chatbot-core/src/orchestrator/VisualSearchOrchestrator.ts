import type { ImageRetrievalService } from "../image"
import type { ProductCard } from "../types"
import { meetsImageSimilarityThreshold } from "../utils"

export interface VisualSearchResponse {
  products: ProductCard[]
  hasResults: boolean
}

const DEFAULT_TOP_K = 5

// Coordinates "products that look like this one" behind POST /store/search/visual:
// pure visual similarity, no LLM, no conversation. Implements no business logic
// of its own — retrieval is delegated to the injected collaborator.
export class VisualSearchOrchestrator {
  constructor(private readonly imageRetrievalService: ImageRetrievalService) {}

  // Returns null when the product has no indexed image embedding, letting the
  // route answer 404 rather than an empty result set — "this product cannot be
  // searched by image" and "nothing looks like it" are different answers.
  async search(medusaProductId: string, topK = DEFAULT_TOP_K): Promise<VisualSearchResponse | null> {
    const embedding = await this.imageRetrievalService.getImageEmbedding(medusaProductId)
    if (!embedding) return null

    // Ask for one extra: the query product is its own nearest neighbour at
    // similarity 1.0 and is dropped below, so without the +1 a topK of 5 would
    // surface only 4 other products.
    const results = await this.imageRetrievalService.search(embedding, topK + 1)

    const relevant = results
      .filter((r) => r.product.medusaProductId !== medusaProductId)
      .filter((r) => meetsImageSimilarityThreshold(r.similarityScore))
      .slice(0, topK)

    return {
      products: relevant.map((r) => ({
        id: r.product.id,
        medusaProductId: r.product.medusaProductId,
        title: r.product.title,
        thumbnailUrl: r.product.thumbnailUrl,
        priceMin: r.product.priceMin ?? 0,
        priceMax: r.product.priceMax ?? 0,
        similarityScore: r.similarityScore,
      })),
      hasResults: relevant.length > 0,
    }
  }
}
