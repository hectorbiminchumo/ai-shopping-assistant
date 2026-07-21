/**
 * Sample real image-search scores to recalibrate IMAGE_SIMILARITY_THRESHOLD
 * (W4 Ticket 13).
 *
 *   cd apps/chatbot-core
 *   node --env-file=.env scripts/calibrate-image-threshold.mjs <samples-dir> [--out scores.csv] [--rpm 3]
 *
 * Layout of <samples-dir> — the sub-directory is the label:
 *
 *   samples/
 *   ├── match/      photos that DO have a clear match in the catalog
 *   ├── no-match/   photos of things the catalog does not sell (negative controls)
 *   └── *.jpg       anything loose here is measured but ignored by the analysis
 *
 * Writes one CSV row per image (top-5 scores) and prints a suggested cutoff.
 *
 * This deliberately does NOT go through POST /store/chat/image-search: the
 * threshold only depends on retrieval, so skipping the LLM call makes the run
 * faster, free of OpenAI cost, and immune to how the assistant words its reply.
 * It measures pure-image scores — the same numbers the orchestrator sees when
 * there is no text query.
 */
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import {
  loadConfig,
  createImageEmbedder,
} from "./lib/image-ingest-helpers.js"
import {
  isImageFile,
  labelForRelativePath,
  toCsv,
  suggestThreshold,
  MATCH_DIR,
  NO_MATCH_DIR,
} from "./lib/threshold-calibration-helpers.js"

const TOP_K = 5

// Single pass so a flag's value is never mistaken for the positional argument.
const VALUE_FLAGS = new Set(["--out", "--rpm"])
const opts = { out: "image-threshold-scores.csv", rpm: "3" }
let samplesDir
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (VALUE_FLAGS.has(arg)) opts[arg.slice(2)] = process.argv[++i]
  else if (!arg.startsWith("--")) samplesDir ??= arg
}

const outPath = opts.out
// Voyage's free tier allows 3 requests/minute; one embed call per image.
const rpm = Number(opts.rpm)

if (!samplesDir) {
  console.error(
    "❌  Usage: node scripts/calibrate-image-threshold.mjs <samples-dir> [--out scores.csv] [--rpm 3]"
  )
  process.exit(1)
}

let config
try {
  config = loadConfig(process.env)
} catch (err) {
  console.error(`❌  ${err.message}`)
  process.exit(1)
}

// ── Collect samples ─────────────────────────────────────────────────────────

async function collectImages(root) {
  const found = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (isImageFile(entry.name)) found.push(full)
    }
  }
  await walk(root)
  return found.sort()
}

const files = await collectImages(samplesDir)
if (files.length === 0) {
  console.error(`❌  No .jpg/.jpeg/.png/.webp files under ${samplesDir}`)
  process.exit(1)
}

const samples = files.map((full) => {
  const rel = relative(samplesDir, full).split("\\").join("/")
  return { full, file: rel, label: labelForRelativePath(rel) }
})

const counts = samples.reduce((acc, s) => ({ ...acc, [s.label]: (acc[s.label] ?? 0) + 1 }), {})
const delayMs = rpm > 0 ? Math.ceil(60000 / rpm) : 0
const etaMin = ((samples.length - 1) * delayMs) / 60000

console.log(`Samples : ${samples.length}  (${MATCH_DIR}: ${counts.match ?? 0} · ${NO_MATCH_DIR}: ${counts["no-match"] ?? 0} · unlabeled: ${counts.unlabeled ?? 0})`)
console.log(`Pacing  : ${rpm} req/min → ETA ~${etaMin.toFixed(1)} min`)
console.log(`Output  : ${outPath}\n`)

if ((counts.match ?? 0) === 0 || (counts["no-match"] ?? 0) === 0) {
  console.log(
    `⚠️  Without images in BOTH ${MATCH_DIR}/ and ${NO_MATCH_DIR}/ the scores still get\n` +
      `    written, but no cutoff can be suggested — a threshold needs both populations.\n`
  )
}

// ── Retrieval (PostgREST RPC, same one ImageRetrievalService calls) ──────────

const restUrl = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1`

async function matchByImage(embedding) {
  const res = await fetch(`${restUrl}/rpc/match_products_by_image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      apikey: config.supabaseServiceRoleKey,
    },
    body: JSON.stringify({ query_embedding: embedding, match_count: TOP_K }),
  })
  if (!res.ok) throw new Error(`match_products_by_image ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Run ─────────────────────────────────────────────────────────────────────

const embedder = createImageEmbedder({
  apiKey: config.voyageApiKey,
  model: config.model,
  baseUrl: config.voyageBaseUrl,
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []

for (const [i, sample] of samples.entries()) {
  const tag = `[${i + 1}/${samples.length}] ${sample.file} (${sample.label})`
  if (i > 0 && delayMs > 0) await sleep(delayMs)

  try {
    const buffer = await readFile(sample.full)
    const embedding = await embedder.embedImage(buffer)
    const rows = await matchByImage(embedding)
    const scores = rows.map((r) => r.similarity)
    results.push({ ...sample, scores, topTitle: rows[0]?.title })
    console.log(`${tag} → ${scores[0]?.toFixed(4) ?? "no rows"}  ${rows[0]?.title ?? ""}`)
  } catch (err) {
    results.push({ ...sample, scores: [], error: err.message })
    console.log(`${tag} → FAILED: ${err.message}`)
  }
}

await writeFile(outPath, toCsv(results))
console.log(`\n✅  Wrote ${results.length} rows to ${outPath}`)

// ── Analysis ────────────────────────────────────────────────────────────────

const analysis = suggestThreshold(results)

if (!analysis.ok) {
  console.log(`\n⚠️  No cutoff suggested: ${analysis.reason}`)
  process.exit(0)
}

console.log(`\nScore ranges (top-1):`)
console.log(`  ${MATCH_DIR}    (${analysis.matchCount}) : ${analysis.minMatch.toFixed(4)} – ${analysis.maxMatch.toFixed(4)}`)
console.log(`  ${NO_MATCH_DIR} (${analysis.noMatchCount}) : ${analysis.minNoMatch.toFixed(4)} – ${analysis.maxNoMatch.toFixed(4)}`)

if (analysis.separated) {
  console.log(`\n✅  The two populations are cleanly separated.`)
  console.log(`    Suggested IMAGE_SIMILARITY_THRESHOLD = ${analysis.threshold}`)
} else {
  console.log(`\n⚠️  The populations OVERLAP — no cutoff classifies every sample correctly.`)
  console.log(`    Best available IMAGE_SIMILARITY_THRESHOLD = ${analysis.threshold}`)
  console.log(`    ${analysis.falseLostSales} match(es) below it → logged as false lost sales`)
  console.log(`    ${analysis.falsePositives} no-match(es) above it → real gaps that go unreported`)
  console.log(`    Consider adding samples, or re-checking the labels of the outliers in the CSV.`)
}
