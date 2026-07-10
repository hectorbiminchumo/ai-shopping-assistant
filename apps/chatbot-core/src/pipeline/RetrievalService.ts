import { getSupabaseClient } from "../config"
import { RetrievalError } from "../errors"
import { titleMatchesAudience } from "../utils/audience"
import type { IRetrievalService } from "../interfaces"
import type { ParsedQuery, RetrievalResult } from "../types"
import type { Product } from "../types"

// Row shape returned by Supabase RPC — matches product_embeddings columns
interface ProductEmbeddingRow {
  id: string
  medusa_product_id: string
  title: string
  description: string
  category: string | null
  tags: string[] | null
  available_sizes: string[] | null
  price_min: number | null
  price_max: number | null
  thumbnail_url: string | null
  similarity: number
}

// When the user names an audience, fetch extra candidates so enough survive
// the title-based audience filter to still fill topK. 8× topK covers an
// entire category (~32 rows), so paraphrased queries with the same filters
// see the same candidate pool instead of clipping it differently.
const AUDIENCE_OVERFETCH = 8

// Categories change only when the catalog is re-ingested (hourly cron), so
// cache them across requests instead of hitting Supabase on every message.
let categoriesCache: { values: string[]; fetchedAt: number } | null = null
const CATEGORIES_TTL_MS = 10 * 60 * 1000

export class RetrievalService implements IRetrievalService {
  async search(
    embedding: number[],
    query: ParsedQuery,
    topK: number
  ): Promise<RetrievalResult[]> {
    try {
      const supabase = getSupabaseClient()

      // The embeddings table has no audience column — the audience lives in
      // the title ("Nike Women ..."). Over-fetch, then filter by title.
      const matchCount = query.audience ? topK * AUDIENCE_OVERFETCH : topK

      const { data, error } = await supabase.rpc("match_products", {
        query_embedding: embedding,
        match_count: matchCount,
        filter_category:  query.category  ?? null,
        filter_price_max: query.priceMax  ?? null,
        filter_price_min: query.priceMin  ?? null,
        filter_size:      query.size      ?? null,
      })

      if (error) throw new RetrievalError(error.message)

      const rows = (data ?? []) as ProductEmbeddingRow[]

      let results = rows.map((row) => ({
        product: this.toProduct(row),
        similarityScore: row.similarity,
      }))

      if (query.audience) {
        const audience = query.audience
        results = results
          .filter((r) => titleMatchesAudience(r.product.title, audience))
          .slice(0, topK)
      }

      return results
    } catch (err) {
      if (err instanceof RetrievalError) throw err
      throw new RetrievalError("Vector search failed", err)
    }
  }

  async listCategories(): Promise<string[]> {
    if (categoriesCache && Date.now() - categoriesCache.fetchedAt < CATEGORIES_TTL_MS) {
      return categoriesCache.values
    }

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from("product_embeddings")
        .select("category")
        .not("category", "is", null)

      if (error) return []

      const values = [
        ...new Set(
          ((data ?? []) as { category: string }[])
            .map((row) => row.category.trim())
            .filter(Boolean)
        ),
      ]
      categoriesCache = { values, fetchedAt: Date.now() }
      return values
    } catch {
      // Best-effort: without categories the search simply runs unfiltered
      return []
    }
  }

  private toProduct(row: ProductEmbeddingRow): Product {
    return {
      id: row.id,
      medusaProductId: row.medusa_product_id,
      title: row.title,
      description: row.description,
      category: row.category ?? undefined,
      tags: row.tags ?? [],
      thumbnailUrl: row.thumbnail_url ?? undefined,
      priceMin: row.price_min ?? undefined,
      priceMax: row.price_max ?? undefined,
      variants: [],
    }
  }
}
