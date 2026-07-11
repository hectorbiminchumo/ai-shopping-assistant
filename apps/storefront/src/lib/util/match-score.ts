// voyage-3 compresses cosine similarity into a narrow band (~0.35–0.55 for
// this catalog — see the project CLAUDE.md; the "no results" threshold is
// 0.40). Shown raw, a strong 0.47 match would read as "47%", so rescale the
// calibrated band to a friendlier percentage for display.
//
// Mapping: 0.35 → 50%, 0.55 → 99%, clamped at both ends. Results below the
// 0.40 threshold never render as cards, so displayed badges start at ~62%.
// NOTE: first proposal for the display scale — confirm with Hector against
// real score distributions before Demo Day.
const RAW_MIN = 0.35
const RAW_MAX = 0.55
const PCT_MIN = 50
const PCT_MAX = 99

export function matchScoreToPercent(score: number): number {
  const t = (score - RAW_MIN) / (RAW_MAX - RAW_MIN)
  const clamped = Math.min(Math.max(t, 0), 1)
  return Math.round(PCT_MIN + clamped * (PCT_MAX - PCT_MIN))
}
