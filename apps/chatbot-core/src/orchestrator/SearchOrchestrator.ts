import type { IEmbeddingService, IRetrievalService } from "../interfaces"
import type { QueryParser, Reranker } from "../pipeline"
import type { ProductCard } from "../types"
import { meetsSimilarityThreshold } from "../utils"

export interface SearchResponse {
  products: ProductCard[]
  hasResults: boolean
}

// Fetch more candidates than the final result set so the re-ranker has a
// meaningful pool to score; final output is capped at RERANK_K after filtering.
const RETRIEVE_K = 10
const RERANK_K = 5

// Coordinates the pure semantic-search path (no LLM, no conversation
// history) behind POST /search/semantic. Implements no business logic
// itself — each step is delegated to a single-responsibility collaborator
// injected via the constructor (Dependency Inversion).
export class SearchOrchestrator {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly embeddingService: IEmbeddingService,
    private readonly retrievalService: IRetrievalService,
    private readonly reranker: Reranker
  ) {}

  async search(rawQuery: string): Promise<SearchResponse> {
    // Known categories let the parser emit a SQL pre-filter (e.g. "shoes"
    // in the query → only shoe rows are vector-searched)
    const knownCategories = await this.retrievalService.listCategories()
    const parsedQuery = this.queryParser.parse(rawQuery, knownCategories)
    const embedding = await this.embeddingService.embedText(parsedQuery.embeddingText)
    const candidates = await this.retrievalService.search(embedding, parsedQuery, RETRIEVE_K)
    const reranked = this.reranker.rerank(parsedQuery, candidates, RERANK_K)

    const relevant = reranked.filter((r) => meetsSimilarityThreshold(r.similarityScore))

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
