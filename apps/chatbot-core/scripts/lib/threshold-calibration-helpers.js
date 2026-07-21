/**
 * Pure/testable helpers for scripts/calibrate-image-threshold.mjs — the
 * sampling run behind W4 Ticket 13 (recalibrating IMAGE_SIMILARITY_THRESHOLD).
 *
 * CommonJS for the same reason as the other lib/ modules: the ESM CLI imports
 * named bindings and Jest can require() it with no ESM config.
 *
 * The threshold decides `has_results` in chat_logs, i.e. whether an image
 * search counts as a lost sale on the analytics dashboard. Picking it needs two
 * labelled populations — photos that DO have a catalog match and photos that do
 * not — and a cutoff that separates their top scores.
 */

// Image files are labelled by the sub-directory they sit in, so adding a sample
// is dropping a file in a folder — no manifest to keep in sync.
const MATCH_DIR = "match"
const NO_MATCH_DIR = "no-match"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])

function isImageFile(name) {
  const dot = name.lastIndexOf(".")
  return dot !== -1 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

/**
 * Maps a path relative to the sample root onto its label. Files directly in the
 * root are "unlabeled": still measured and written to the CSV, but ignored when
 * computing the cutoff, since an unlabelled score proves nothing either way.
 */
function labelForRelativePath(relativePath) {
  const [first, ...rest] = relativePath.split("/")
  if (rest.length === 0) return "unlabeled"
  if (first === MATCH_DIR) return "match"
  if (first === NO_MATCH_DIR) return "no-match"
  return "unlabeled"
}

// ── CSV output ──────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "file",
  "label",
  "query",
  "top_score",
  "top_title",
  "score_2",
  "score_3",
  "score_4",
  "score_5",
  "error",
]

function csvEscape(value) {
  const str = value === undefined || value === null ? "" : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsvRow(sample) {
  const scores = sample.scores ?? []
  return [
    sample.file,
    sample.label,
    sample.query ?? "",
    scores[0] !== undefined ? scores[0].toFixed(4) : "",
    sample.topTitle ?? "",
    scores[1] !== undefined ? scores[1].toFixed(4) : "",
    scores[2] !== undefined ? scores[2].toFixed(4) : "",
    scores[3] !== undefined ? scores[3].toFixed(4) : "",
    scores[4] !== undefined ? scores[4].toFixed(4) : "",
    sample.error ?? "",
  ]
    .map(csvEscape)
    .join(",")
}

function toCsv(samples) {
  return [CSV_COLUMNS.join(","), ...samples.map(toCsvRow)].join("\n") + "\n"
}

// ── Cutoff analysis ─────────────────────────────────────────────────────────

/**
 * Suggests a threshold from the labelled top scores.
 *
 * Clean case — every "match" scores above every "no-match": any cutoff in the
 * gap separates them, so take its midpoint (maximum margin on both sides).
 *
 * Overlapping case — no cutoff is perfect. Rather than silently returning a
 * midpoint that misclassifies samples, this scans every candidate and returns
 * the one with the fewest errors, reporting how many remain. A "match" scored
 * below the cutoff is a false lost sale (the dashboard reports a catalog gap
 * that isn't one); a "no-match" above it is a missed one. False lost sales are
 * the failure this ticket exists to fix, so ties break toward the lower cutoff.
 */
function suggestThreshold(samples) {
  const scoreOf = (label) =>
    samples
      .filter((s) => s.label === label && typeof s.scores?.[0] === "number")
      .map((s) => s.scores[0])

  const matches = scoreOf("match")
  const noMatches = scoreOf("no-match")

  if (matches.length === 0 || noMatches.length === 0) {
    return {
      ok: false,
      reason: `need at least one scored sample in ${MATCH_DIR}/ and one in ${NO_MATCH_DIR}/ (have ${matches.length} and ${noMatches.length})`,
    }
  }

  const minMatch = Math.min(...matches)
  const maxNoMatch = Math.max(...noMatches)
  const stats = {
    matchCount: matches.length,
    noMatchCount: noMatches.length,
    minMatch,
    maxMatch: Math.max(...matches),
    minNoMatch: Math.min(...noMatches),
    maxNoMatch,
  }

  if (minMatch > maxNoMatch) {
    return {
      ok: true,
      separated: true,
      threshold: round4((minMatch + maxNoMatch) / 2),
      falseLostSales: 0,
      falsePositives: 0,
      ...stats,
    }
  }

  // Every score is a candidate boundary; a cutoff only changes behaviour where
  // it crosses one.
  const boundaries = [...new Set([...matches, ...noMatches])].sort((a, b) => a - b)
  const errorsAt = (cutoff) => ({
    falseLostSales: matches.filter((s) => s < cutoff).length,
    falsePositives: noMatches.filter((s) => s >= cutoff).length,
  })

  const scored = boundaries.map((b) => {
    const e = errorsAt(b)
    return { boundary: b, ...e, errors: e.falseLostSales + e.falsePositives }
  })
  const fewest = Math.min(...scored.map((s) => s.errors))
  const optimal = scored.filter((s) => s.errors === fewest)

  // Several cutoffs can tie on error count. Returning the lowest would park the
  // threshold a hair above some sample's score, which is overfitting: one new
  // photo scoring marginally higher flips the classification. Instead take the
  // midpoint of the widest run of tied boundaries, so the cutoff sits as far as
  // possible from any measured score.
  let widest = { from: optimal[0].boundary, to: optimal[0].boundary, width: 0 }
  for (let i = 0; i < optimal.length - 1; i++) {
    const width = optimal[i + 1].boundary - optimal[i].boundary
    if (width > widest.width) {
      widest = { from: optimal[i].boundary, to: optimal[i + 1].boundary, width }
    }
  }
  const threshold = widest.width > 0 ? (widest.from + widest.to) / 2 : optimal[0].boundary

  return {
    ok: true,
    separated: false,
    threshold: round4(threshold),
    ...errorsAt(threshold),
    errors: fewest,
    ...stats,
  }
}

function round4(n) {
  return Number(n.toFixed(4))
}

module.exports = {
  MATCH_DIR,
  NO_MATCH_DIR,
  IMAGE_EXTENSIONS,
  CSV_COLUMNS,
  isImageFile,
  labelForRelativePath,
  csvEscape,
  toCsvRow,
  toCsv,
  suggestThreshold,
}
