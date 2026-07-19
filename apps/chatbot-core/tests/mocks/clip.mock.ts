import type { IImageEmbeddingService } from "../../src/interfaces"

// Named "clip" per product convention, but wraps Voyage AI's
// voyage-multimodal-3.5 endpoint (see src/image/ImageEmbeddingService.ts) —
// there is no CLIP SDK in this repo.
export function createMockImageEmbeddingService(
  vector: number[] = Array(512).fill(0.1)
): IImageEmbeddingService {
  return {
    embedImage: jest.fn().mockResolvedValue(vector),
  }
}
