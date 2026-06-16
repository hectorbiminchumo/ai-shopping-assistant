export const SIMILARITY_THRESHOLD = 0.6

export function meetsSimilarityThreshold(score: number): boolean {
  return score >= SIMILARITY_THRESHOLD
}
