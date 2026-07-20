import type { IImageEmbeddingService } from "../../src/interfaces"

// Mocks the image embedding provider (Voyage AI voyage-multimodal-3.5 — see
// src/image/ImageEmbeddingService.ts) for orchestrator tests.
export function createMockImageEmbeddingService(
  vector: number[] = Array(512).fill(0.1)
): IImageEmbeddingService {
  return {
    embedImage: jest.fn().mockResolvedValue(vector),
  }
}
