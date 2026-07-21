import { getSupabaseClient } from "../config"
import { RetrievalError } from "../errors"
import type { Product, RetrievalResult } from "../types"

// Row shape returned by the match_products_by_image RPC — mirrors the text
// match_products result, minus the text-only filter columns.
interface ImageMatchRow {
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

// Cosine similarity search against the image_embedding column in
// product_embeddings (Supabase/pgvector), mirroring the text RetrievalService.
export class ImageRetrievalService {
  async search(imageEmbedding: number[], topK: number): Promise<RetrievalResult[]> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase.rpc("match_products_by_image", {
        query_embedding: imageEmbedding,
        match_count: topK,
      })

      if (error) throw new RetrievalError(error.message)

      const rows = (data ?? []) as ImageMatchRow[]
      return rows.map((row) => ({
        product: this.toProduct(row),
        similarityScore: row.similarity,
      }))
    } catch (err) {
      if (err instanceof RetrievalError) throw err
      throw new RetrievalError("Image vector search failed", err)
    }
  }

  // Reads a product's already-indexed image embedding, so a catalog product can
  // itself be the query ("more like this" on the product detail page) without
  // re-embedding its photo through Voyage. Returns null when the product is
  // unknown or was never image-indexed — both are the caller's 404, not errors.
  async getImageEmbedding(medusaProductId: string): Promise<number[] | null> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase
        .from("product_embeddings")
        .select("image_embedding")
        .eq("medusa_product_id", medusaProductId)
        .maybeSingle()

      if (error) throw new RetrievalError(error.message)
      if (!data?.image_embedding) return null

      // Supabase returns vector columns as a JSON-encoded string, not an array.
      const raw = data.image_embedding
      return typeof raw === "string" ? JSON.parse(raw) : raw
    } catch (err) {
      if (err instanceof RetrievalError) throw err
      throw new RetrievalError("Failed to read product image embedding", err)
    }
  }

  private toProduct(row: ImageMatchRow): Product {
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
