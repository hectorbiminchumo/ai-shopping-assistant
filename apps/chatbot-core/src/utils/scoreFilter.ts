// Voyage AI voyage-3 compresses cosine similarities to ~0.35-0.55 range for long docs.
// Calibrated from real data: top scores for relevant queries peak at ~0.49.
export const SIMILARITY_THRESHOLD = 0.40

export function meetsSimilarityThreshold(score: number): boolean {
  return score >= SIMILARITY_THRESHOLD
}

// Image search (voyage-multimodal-3.5). Calibrated 2026-07-21 (W4 Ticket 13)
// against the live 100-product catalog with scripts/calibrate-image-threshold.mjs
// over 25 photos — 14 of products the catalog carries, 11 of things it does not:
//
//   match    (14) : 0.4401 – 0.6611
//   no-match (11) : 0.2125 – 0.4140
//
// The populations separate cleanly; 0.42 sits in the gap, misclassifying none.
// Rounded from the 0.427 midpoint — three decimals would overstate the
// precision of a 25-sample estimate.
//
// Do NOT re-derive this from scores measured before 2026-07-21: an ivfflat
// index with lists=100 over 100 rows made the RPC return approximate (often
// wrong) neighbours, which put top scores near ~0.25. Both vector indexes were
// dropped — at this catalog size an exact scan is sub-millisecond and correct.
export const IMAGE_SIMILARITY_THRESHOLD = 0.42

export function meetsImageSimilarityThreshold(score: number): boolean {
  return score >= IMAGE_SIMILARITY_THRESHOLD
}
