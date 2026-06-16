import { RetrievalError } from "../errors"
import type { RetrievalResult } from "../types"

// Cosine similarity search against the image_embedding column in
// product_embeddings (Supabase/pgvector).
export class ImageRetrievalService {
  async search(_imageEmbedding: number[], _topK: number): Promise<RetrievalResult[]> {
    // TODO: query Supabase pgvector (image_embedding column) once the client is configured
    throw new RetrievalError("Supabase client not configured yet")
  }
}
