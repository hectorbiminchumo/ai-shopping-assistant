// Voyage AI voyage-3 compresses cosine similarities to ~0.35-0.55 range for long docs.
// Calibrated from real data: top scores for relevant queries peak at ~0.49.
export const SIMILARITY_THRESHOLD = 0.40

export function meetsSimilarityThreshold(score: number): boolean {
  return score >= SIMILARITY_THRESHOLD
}

// Image search (voyage-multimodal-3.5) — visual cosine scores are less
// compressed than voyage-3 text scores, so the lost-sale cutoff sits higher.
// Starting value: recalibrate against real data once the catalog is indexed.
export const IMAGE_SIMILARITY_THRESHOLD = 0.60

export function meetsImageSimilarityThreshold(score: number): boolean {
  return score >= IMAGE_SIMILARITY_THRESHOLD
}
