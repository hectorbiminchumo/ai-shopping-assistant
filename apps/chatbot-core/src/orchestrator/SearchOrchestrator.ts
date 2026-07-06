import type { IEmbeddingService, IRetrievalService } from "../interfaces"
import type { QueryParser } from "../pipeline"
import type { ProductCard } from "../types"
import { meetsSimilarityThreshold } from "../utils"

export interface SearchResponse {
  products: ProductCard[]
  hasResults: boolean
}

const DEFAULT_TOP_K = 10

// Coordinates the pure semantic-search path (no LLM, no conversation
// history) behind POST /search/semantic. Implements no business logic
// itself — each step is delegated to a single-responsibility collaborator
// injected via the constructor (Dependency Inversion).
export class SearchOrchestrator {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly embeddingService: IEmbeddingService,
    private readonly retrievalService: IRetrievalService
  ) {}

  async search(rawQuery: string, topK: number = DEFAULT_TOP_K): Promise<SearchResponse> {
    // Known categories let the parser emit a SQL pre-filter (e.g. "shoes"
    // in the query → only shoe rows are vector-searched)
    const knownCategories = await this.retrievalService.listCategories()
    const parsedQuery = this.queryParser.parse(rawQuery, knownCategories)
    const embedding = await this.embeddingService.embedText(parsedQuery.rawQuery)
    const retrieved = await this.retrievalService.search(embedding, parsedQuery, topK)

    const relevant = retrieved.filter((r) => meetsSimilarityThreshold(r.similarityScore))

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
