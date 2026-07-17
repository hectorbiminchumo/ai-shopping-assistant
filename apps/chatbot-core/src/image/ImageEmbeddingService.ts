import { EmbeddingError } from "../errors"
import type { IImageEmbeddingService } from "../interfaces"

// Generates image embeddings (512 dims) via Voyage AI voyage-multimodal-3,
// configured to output_dimension 512 so vectors fit product_embeddings
// .image_embedding vector(512). Same account and SDK as the text embeddings.
export class ImageEmbeddingService implements IImageEmbeddingService {
  async embedImage(_image: Buffer): Promise<number[]> {
    // TODO (W4 Ticket 2): call voyage-multimodal-3 with output_dimension 512
    throw new EmbeddingError("voyage-multimodal-3 image embedding client not configured yet")
  }
}
