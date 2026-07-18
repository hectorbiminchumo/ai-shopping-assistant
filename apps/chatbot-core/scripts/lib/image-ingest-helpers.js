/**
 * Pure/testable helpers for scripts/ingest-images.mjs — the image-embedding
 * backfill for Feature 2 (image-based search).
 *
 * CommonJS (not .mjs) for the same reason as ingest-helpers.js: the ESM CLI
 * imports named bindings, and Jest can require() it directly with no ESM config.
 *
 * Flow: read image URLs from the seed CSV (title → Supabase Storage URL),
 * download each image, embed it with voyage-multimodal-3.5 @512d over REST,
 * and UPDATE product_embeddings.image_embedding for the matching row (by
 * medusa_product_id). Products already exist from text ingestion — this only
 * fills the image_embedding column.
 */

const { splitCsvLine, withRetry } = require("./ingest-helpers.js")

// Fixed by the image_embedding vector(512) column — not env-configurable.
const IMAGE_DIM = 512

// ── Config ──────────────────────────────────────────────────────────────────

// Model and endpoint are required env vars (no hardcoded default) — set both
// in .env (see .env.example).
function loadConfig(env) {
  const cfg = {
    voyageApiKey: env.VOYAGE_API_KEY,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    model: env.VOYAGE_MULTIMODAL_MODEL,
    voyageBaseUrl: env.VOYAGE_API_BASE_URL,
  }
  const missing = [
    !cfg.voyageApiKey && "VOYAGE_API_KEY",
    !cfg.supabaseUrl && "SUPABASE_URL",
    !cfg.supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    !cfg.model && "VOYAGE_MULTIMODAL_MODEL",
    !cfg.voyageBaseUrl && "VOYAGE_API_BASE_URL",
  ].filter(Boolean)
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`)
  return cfg
}

// ── CSV → { title → imageUrl } ──────────────────────────────────────────────

// The seed CSV (apps/backend/scripts/data/products.csv) carries the Storage
// image URL in the `thumbnail` column (falls back to the first `images` entry).
function parseImageMap(csvRaw) {
  const lines = csvRaw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const titleIdx = headers.indexOf("title")
  const thumbIdx = headers.indexOf("thumbnail")
  const imagesIdx = headers.indexOf("images")
  if (titleIdx === -1 || (thumbIdx === -1 && imagesIdx === -1)) {
    throw new Error("CSV must have a `title` column and a `thumbnail` or `images` column")
  }

  const map = new Map()
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const title = cols[titleIdx]?.trim()
    const thumb = thumbIdx !== -1 ? cols[thumbIdx]?.trim() : ""
    const firstImage = imagesIdx !== -1 ? cols[imagesIdx]?.split("|")[0]?.trim() : ""
    const url = thumb || firstImage
    if (title && url) map.set(title, url)
  }
  return map
}

// ── Image download ──────────────────────────────────────────────────────────

async function downloadImage(url, { fetchImpl = fetch, retry = withRetry } = {}) {
  return retry(
    async () => {
      const res = await fetchImpl(url)
      if (!res.ok) throw new Error(`download ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    },
    `download ${url}`
  )
}

function detectMimeType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  if (buf.toString("ascii", 0, 4) === "GIF8") return "image/gif"
  throw new Error("Unsupported image format — expected JPEG, PNG, WEBP, or GIF")
}

// ── Voyage multimodal embedder (REST) ───────────────────────────────────────

function createImageEmbedder({
  apiKey,
  model,
  baseUrl,
  fetchImpl = fetch,
  retry = withRetry,
  // Longer/more attempts than the text path: the free Voyage tier (3 RPM)
  // returns 429s that only clear after tens of seconds.
  maxRetries = 4,
  baseDelayMs = 5000,
}) {
  async function embedImage(buffer) {
    const dataUrl = `data:${detectMimeType(buffer)};base64,${buffer.toString("base64")}`
    const embedding = await retry(async () => {
      const res = await fetchImpl(`${baseUrl}/multimodalembeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [{ content: [{ type: "image_base64", image_base64: dataUrl }] }],
          model,
          output_dimension: IMAGE_DIM,
        }),
      })
      if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`)
      const body = await res.json()
      const vec = body.data?.[0]?.embedding
      if (!vec) throw new Error("empty embedding response")
      return vec
    }, "embed image", maxRetries, baseDelayMs)

    if (embedding.length !== IMAGE_DIM) {
      throw new Error(`unexpected dimension ${embedding.length} (expected ${IMAGE_DIM})`)
    }
    return embedding
  }
  return { embedImage }
}

// ── Supabase (PostgREST) ────────────────────────────────────────────────────

function createSupabaseImageStore({ url, serviceRoleKey, fetchImpl = fetch }) {
  const restUrl = `${url.replace(/\/$/, "")}/rest/v1`
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  }

  // Products already indexed for text — read the existing rows to drive the run.
  async function listProducts() {
    const res = await fetchImpl(`${restUrl}/product_embeddings?select=medusa_product_id,title`, { headers })
    if (!res.ok) throw new Error(`list products failed: ${res.status} — ${await res.text()}`)
    return res.json()
  }

  async function updateImageEmbedding(medusaProductId, embedding) {
    const res = await fetchImpl(
      `${restUrl}/product_embeddings?medusa_product_id=eq.${encodeURIComponent(medusaProductId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ image_embedding: embedding, updated_at: new Date().toISOString() }),
      }
    )
    if (!res.ok) throw new Error(`update failed: ${res.status} — ${await res.text()}`)
  }

  async function countIndexed() {
    const res = await fetchImpl(
      `${restUrl}/product_embeddings?select=medusa_product_id&image_embedding=not.is.null`,
      { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } }
    )
    return Number((res.headers.get("content-range") || "*/0").split("/")[1])
  }

  return { listProducts, updateImageEmbedding, countIndexed }
}

// ── Orchestration ───────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function runImageIngestion(
  { products, imageMap, dryRun, embedder, store, delayMs = 0, download = downloadImage },
  { onProgress = () => {} } = {}
) {
  const stats = { ok: 0, skipped: 0, failed: 0 }
  const total = products.length
  let embedded = 0 // count of products that actually hit the Voyage API

  for (let i = 0; i < total; i++) {
    const p = products[i]
    const url = imageMap.get(p.title)
    const base = { index: i, total, title: p.title }

    if (!url) {
      onProgress({ ...base, status: "skipped", reason: "no image URL in CSV" })
      stats.skipped++
      continue
    }

    // Throttle to stay under the Voyage rate limit — pace only between actual
    // API calls, not before the first one or after skipped rows.
    if (delayMs > 0 && embedded > 0) await sleep(delayMs)
    embedded++

    try {
      const buffer = await download(url)
      const embedding = await embedder.embedImage(buffer)
      if (!dryRun) await store.updateImageEmbedding(p.medusa_product_id, embedding)
      onProgress({ ...base, status: dryRun ? "dry-run" : "ok", dim: embedding.length })
      stats.ok++
    } catch (err) {
      onProgress({ ...base, status: "failed", error: err.message })
      stats.failed++
    }
  }

  return stats
}

module.exports = {
  IMAGE_DIM,
  loadConfig,
  parseImageMap,
  downloadImage,
  detectMimeType,
  createImageEmbedder,
  createSupabaseImageStore,
  runImageIngestion,
}
