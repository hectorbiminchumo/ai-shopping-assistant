// Image embedding provider contract (voyage-multimodal-3 @512d today).
// Segregated from IEmbeddingService on purpose: text embeds a string, image
// embeds a Buffer, so a single interface would force each provider to
// implement a method it does not support (Interface Segregation Principle).
// The orchestrator depends on this abstraction, not the concrete provider —
// swapping the image model later means one new class, zero orchestrator changes.
export interface IImageEmbeddingService {
  // Returns a 512d vector for the given image bytes. Must use the same model
  // and dimension as the vectors stored in product_embeddings.image_embedding.
  embedImage(image: Buffer): Promise<number[]>
}
