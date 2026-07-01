// Voyage AI voyage-3 compresses cosine similarities to ~0.35-0.55 range for long docs.
// Calibrated from real data: top scores for relevant queries peak at ~0.49.
export const SIMILARITY_THRESHOLD = 0.40

export function meetsSimilarityThreshold(score: number): boolean {
  return score >= SIMILARITY_THRESHOLD
}
