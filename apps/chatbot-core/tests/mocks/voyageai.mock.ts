import type { IEmbeddingService } from "../../src/interfaces"

export function createMockEmbeddingService(vector: number[] = [0.1, 0.2, 0.3]): IEmbeddingService {
  return {
    embedText: jest.fn().mockResolvedValue(vector),
    embedBatch: jest.fn().mockResolvedValue([vector]),
  }
}
