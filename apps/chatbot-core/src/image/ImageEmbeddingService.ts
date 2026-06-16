import { EmbeddingError } from "../errors"

// Generates CLIP image embeddings (512 dims). CLIP runs as a separate
// service or via Replicate API to avoid heavy ML dependencies in Node.js.
export class ImageEmbeddingService {
  async embedImage(_imageBuffer: Buffer): Promise<number[]> {
    // TODO: call the CLIP service/Replicate API once it's chosen and configured
    throw new EmbeddingError("CLIP image embedding client not configured yet")
  }
}
