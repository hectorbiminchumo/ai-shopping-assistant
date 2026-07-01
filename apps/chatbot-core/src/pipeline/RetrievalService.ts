import { getSupabaseClient } from "../config"
import { RetrievalError } from "../errors"
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
  price_min: number | null
  price_max: number | null
  thumbnail_url: string | null
  similarity: number
}

export class RetrievalService implements IRetrievalService {
  async search(
    embedding: number[],
    query: ParsedQuery,
    topK: number
  ): Promise<RetrievalResult[]> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase.rpc("match_products", {
        query_embedding: embedding,
        match_count: topK,
        filter_category: query.category ?? null,
        filter_price_max: query.priceMax ?? null,
      })

      if (error) throw new RetrievalError(error.message)

      const rows = (data ?? []) as ProductEmbeddingRow[]

      return rows.map((row) => ({
        product: this.toProduct(row),
        similarityScore: row.similarity,
      }))
    } catch (err) {
      if (err instanceof RetrievalError) throw err
      throw new RetrievalError("Vector search failed", err)
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
