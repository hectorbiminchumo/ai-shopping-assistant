import { RetrievalError } from "../errors"
import type { IRetrievalService } from "../interfaces"
import type { ParsedQuery, RetrievalResult } from "../types"

// Cosine similarity search against Supabase/pgvector. Structured filters
// from QueryParser (category, priceMax, size) are applied as SQL WHERE
// clauses before the vector search to improve precision.
export class RetrievalService implements IRetrievalService {
  async search(
    _embedding: number[],
    _query: ParsedQuery,
    _topK: number
  ): Promise<RetrievalResult[]> {
    // TODO: query Supabase pgvector once the client is configured in config/supabase.config.ts
    throw new RetrievalError("Supabase client not configured yet")
  }
}
