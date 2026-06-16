import type { ParsedQuery, RetrievalResult } from "../types"

export interface IRetrievalService {
  search(embedding: number[], query: ParsedQuery, topK: number): Promise<RetrievalResult[]>
}
