import type { Product } from "../types"

// Builds the rich text that gets embedded for semantic search: title +
// description + tags + category. Keep this consistent between ingestion
// and querying — embedding model and input shape must match.
// Mirrored by buildEmbeddingText() in scripts/lib/ingest-helpers.js — must stay in sync.
export class ChunkBuilder {
  build(product: Product): string {
    return [
      product.title,
      product.description,
      product.category ?? "",
      product.tags.join(" "),
    ]
      .filter(Boolean)
      .join("\n")
  }
}
