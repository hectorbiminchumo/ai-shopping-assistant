import type { ParsedQuery, RetrievalResult } from "../types"

export interface IRetrievalService {
  search(embedding: number[], query: ParsedQuery, topK: number): Promise<RetrievalResult[]>
  // Distinct catalog categories, used by QueryParser to turn category
  // mentions in the query into a SQL pre-filter. Best-effort: implementations
  // return [] on failure so search still works without the filter.
  listCategories(): Promise<string[]>
}
