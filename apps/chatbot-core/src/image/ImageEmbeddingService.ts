import { aiConfig } from "../config"
import { EmbeddingError } from "../errors"
import type { IImageEmbeddingService } from "../interfaces"

// Sniff the MIME type from the file's magic bytes. Voyage needs the image as a
// `data:<mediatype>;base64,...` URL, and it only accepts png/jpeg/webp/gif.
function detectMimeType(image: Buffer): string {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    image.length >= 8 &&
    image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
  ) {
    return "image/png"
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    image.length >= 12 &&
    image.toString("ascii", 0, 4) === "RIFF" &&
    image.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  if (image.length >= 4 && image.toString("ascii", 0, 4) === "GIF8") {
    return "image/gif"
  }
  throw new EmbeddingError("Unsupported image format — expected JPEG, PNG, WEBP, or GIF")
}

interface MultimodalEmbedResponse {
  data?: { embedding?: number[] }[]
}

// Generates image embeddings via Voyage AI voyage-multimodal-3.5, requesting
// output_dimension 512 so vectors fit product_embeddings.image_embedding
// vector(512). Called over REST because the installed voyageai SDK (v0.0.4)
// does not expose output_dimension for multimodal embeddings.
export class ImageEmbeddingService implements IImageEmbeddingService {
  async embedImage(image: Buffer): Promise<number[]> {
    if (!aiConfig.voyageApiKey) {
      throw new EmbeddingError("VOYAGE_API_KEY is not set")
    }
    if (image.length === 0) {
      throw new EmbeddingError("Empty image buffer")
    }

    const dataUrl = `data:${detectMimeType(image)};base64,${image.toString("base64")}`

    try {
      const embedding = await this.withRetry(() => this.requestEmbedding(dataUrl))
      if (embedding.length !== aiConfig.imageEmbeddingDimensions) {
        throw new EmbeddingError(
          `Unexpected image embedding dimension ${embedding.length} — expected ${aiConfig.imageEmbeddingDimensions}`
        )
      }
      return embedding
    } catch (err) {
      if (err instanceof EmbeddingError) throw err
      throw new EmbeddingError("Failed to generate image embedding", err)
    }
  }

  private async requestEmbedding(dataUrl: string): Promise<number[]> {
    const res = await fetch(`${aiConfig.voyageApiBaseUrl}/multimodalembeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.voyageApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [{ content: [{ type: "image_base64", image_base64: dataUrl }] }],
        model: aiConfig.voyageMultimodalModel,
        output_dimension: aiConfig.imageEmbeddingDimensions,
      }),
    })

    if (!res.ok) {
      throw new EmbeddingError(`Voyage multimodal API error ${res.status}: ${await res.text()}`)
    }

    const body = (await res.json()) as MultimodalEmbedResponse
    const embedding = body.data?.[0]?.embedding
    if (!embedding) {
      throw new EmbeddingError("Empty embedding response from Voyage multimodal API")
    }
    return embedding
  }

  // Same short backoff as the text EmbeddingService — the Voyage free tier
  // rate-limits under light load, and this runs in the live request path.
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = 150): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        // A 4xx (bad image, bad key) will never succeed on retry — only retry
        // transient failures. EmbeddingError from a non-2xx carries the status.
        if (err instanceof EmbeddingError && /API error 4\d\d/.test(err.message)) throw err
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt))
        }
      }
    }
    throw lastErr
  }
}
