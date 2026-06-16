import type { IChatLogger, IRetrievalService } from "../../src/interfaces"
import type { RetrievalResult } from "../../src/types"

export function createMockRetrievalService(results: RetrievalResult[] = []): IRetrievalService {
  return {
    search: jest.fn().mockResolvedValue(results),
  }
}

export function createMockImageRetrievalService(results: RetrievalResult[] = []) {
  return {
    search: jest.fn().mockResolvedValue(results),
  }
}

export function createMockChatLogger(): IChatLogger {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  }
}
