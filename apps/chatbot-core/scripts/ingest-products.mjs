/**
 * Seed the Supabase product_embeddings table from a JSON or CSV file.
 *
 * Usage:
 *   node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json
 *   node --env-file=.env scripts/ingest-products.mjs --file ./data/products.csv
 *   node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json --dry-run
 *
 * JSON format  → array of product objects (see README for full schema)
 * CSV format   → header row required; tags column is pipe-separated (tag1|tag2)
 *
 * Env vars required (same as .env.example):
 *   VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs"
import { extname } from "node:path"
import { VoyageAIClient } from "voyageai"

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const fileArg = args[args.indexOf("--file") + 1]
const dryRun = args.includes("--dry-run")

if (!fileArg) {
  console.error("❌  --file <path> is required")
  console.error("    Example: node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json")
  process.exit(1)
}

// ── Env validation ────────────────────────────────────────────────────────────

const VOYAGE_API_KEY            = process.env.VOYAGE_API_KEY
const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MEDUSA_BACKEND_URL        = (process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000").replace(/\/$/, "")
const MEDUSA_ADMIN_EMAIL        = process.env.MEDUSA_ADMIN_EMAIL
const MEDUSA_ADMIN_PASSWORD     = process.env.MEDUSA_ADMIN_PASSWORD

const missing = [
  !VOYAGE_API_KEY && "VOYAGE_API_KEY",
  !SUPABASE_URL && "SUPABASE_URL",
  !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
].filter(Boolean)

if (missing.length) {
  console.error(`❌  Missing env vars: ${missing.join(", ")}`)
  process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY })

// Use PostgREST directly — avoids the WebSocket/Realtime init that
// @supabase/supabase-js triggers on Node.js < 22.
const REST_URL     = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`
const SUPABASE_HEADERS = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey":        SUPABASE_SERVICE_ROLE_KEY,
  "Prefer":        "resolution=merge-duplicates",
}

// ── Medusa ID lookup ──────────────────────────────────────────────────────────

let medusaToken = null
const medusaIdCache = new Map() // title → medusa product id

async function getMedusaToken() {
  if (medusaToken) return medusaToken
  if (!MEDUSA_ADMIN_EMAIL || !MEDUSA_ADMIN_PASSWORD) return null

  const res  = await fetch(`${MEDUSA_BACKEND_URL}/auth/user/emailpass`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email: MEDUSA_ADMIN_EMAIL, password: MEDUSA_ADMIN_PASSWORD }),
  })
  const data = await res.json()
  medusaToken = data.token ?? null
  return medusaToken
}

async function fetchMedusaProductId(title) {
  if (medusaIdCache.has(title)) return medusaIdCache.get(title)

  const token = await getMedusaToken()
  if (!token) return null

  const res  = await fetch(
    `${MEDUSA_BACKEND_URL}/admin/products?q=${encodeURIComponent(title)}&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  const product = data.products?.find((p) => p.title === title)
  const id = product?.id ?? null
  if (id) medusaIdCache.set(title, id)
  return id
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

async function upsertEmbedding(row) {
  const res = await fetch(`${REST_URL}/product_embeddings`, {
    method:  "POST",
    headers: SUPABASE_HEADERS,
    body:    JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase upsert failed: ${res.status} — ${body}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mirrors ChunkBuilder.build() — must stay in sync with src/ingestion/ChunkBuilder.ts */
function buildEmbeddingText(product) {
  return [
    product.title,
    product.description,
    product.category ?? "",
    Array.isArray(product.tags) ? product.tags.join(" ") : (product.tags ?? ""),
  ]
    .filter(Boolean)
    .join("\n")
}

/** Exponential backoff retry — handles transient Voyage AI 429 / network errors. */
async function withRetry(fn, label, maxRetries = 3, baseDelayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err
      const delay = baseDelayMs * 2 ** (attempt - 1)
      console.warn(`  ⚠️  ${label} — attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms…`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseJson(raw) {
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error("JSON file must be an array of product objects")
  return data
}

/**
 * Minimal but correct CSV parser: handles double-quoted fields (with embedded
 * commas and escaped quotes). Tags column uses | as separator to avoid
 * conflicts with the CSV comma delimiter.
 */
function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headers = splitCsvLine(lines[0])

  return lines.slice(1).map((line, i) => {
    const values = splitCsvLine(line)
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${i + 2}: expected ${headers.length} columns, got ${values.length}`)
    }

    const row = Object.fromEntries(headers.map((h, idx) => [h.trim(), values[idx]]))

    return {
      medusa_product_id: row.medusa_product_id,
      title: row.title,
      description: row.description,
      category: row.category || undefined,
      // CSV uses pipe-separated tags: "trail|road|lightweight"
      tags: row.tags ? row.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
      price_min: row.price_min ? Number(row.price_min) : undefined,
      price_max: row.price_max ? Number(row.price_max) : undefined,
      thumbnail_url: row.thumbnail_url || undefined,
    }
  })
}

function splitCsvLine(line) {
  const fields = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateProduct(product, index) {
  const errors = []
  if (!product.title) errors.push("title is required")
  if (!product.description) errors.push("description is required")
  if (errors.length) throw new Error(`Product at index ${index}: ${errors.join(", ")}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀  Product ingestion script`)
  if (dryRun) console.log("    Mode: DRY RUN — no writes to Supabase\n")
  else console.log("    Mode: LIVE — writing to Supabase\n")

  // Load + parse file
  const raw = readFileSync(fileArg, "utf-8")
  const ext = extname(fileArg).toLowerCase()
  const products = ext === ".csv" ? parseCsv(raw) : parseJson(raw)

  console.log(`📄  Loaded ${products.length} products from ${fileArg}\n`)

  // Validate all rows upfront before touching any API
  products.forEach(validateProduct)

  const stats = { ok: 0, failed: 0 }

  // ── Step 1: resolve Medusa IDs upfront ───────────────────────────────────────
  if (!dryRun) {
    process.stdout.write(`🔑  Resolving Medusa product IDs… `)
    for (const p of products) {
      if (!p.medusa_product_id) {
        p.medusa_product_id = await fetchMedusaProductId(p.title) ?? undefined
      }
    }
    const missing = products.filter((p) => !p.medusa_product_id).length
    if (missing > 0) console.log(`⚠️  ${missing} products not found in Medusa (will be skipped)`)
    else console.log(`✅`)
  }

  // ── Step 2: batch embed all products in one Voyage AI request ─────────────
  console.log(`\n🧠  Generating embeddings (1 batch request to Voyage AI)… `)
  const chunks = products.map(buildEmbeddingText)

  let embeddings
  if (dryRun) {
    // fake embeddings for dry-run
    embeddings = products.map(() => Array(1024).fill(0))
  } else {
    embeddings = await withRetry(
      () => voyage.embed({ input: chunks, model: "voyage-3" }).then((r) => {
        if (!r.data?.length) throw new Error("Empty batch response from Voyage AI")
        return r.data.map((d) => {
          if (!d.embedding) throw new Error("Missing embedding in batch response")
          return d.embedding
        })
      }),
      "batch embed"
    )
  }
  console.log(`✅  ${embeddings.length} embeddings generated (dim=${embeddings[0].length})\n`)

  // ── Step 3: upsert each product into Supabase ─────────────────────────────
  for (let i = 0; i < products.length; i++) {
    const p         = products[i]
    const embedding = embeddings[i]
    const label     = `[${i + 1}/${products.length}] ${p.title}`

    process.stdout.write(`  ${label}… `)

    if (dryRun) {
      console.log(`✅  (dry-run)`)
      stats.ok++
      continue
    }

    if (!p.medusa_product_id) {
      console.log(`⏭️  skipped (not found in Medusa)`)
      stats.failed++
      continue
    }

    try {
      await upsertEmbedding({
        medusa_product_id: p.medusa_product_id,
        title:             p.title,
        description:       p.description,
        category:          p.category ?? null,
        tags:              p.tags ?? [],
        price_min:         p.price_min ?? null,
        price_max:         p.price_max ?? null,
        thumbnail_url:     p.thumbnail_url ?? null,
        embedding,
        updated_at:        new Date().toISOString(),
      })
      console.log(`✅  upserted`)
      stats.ok++
    } catch (err) {
      console.log(`❌  FAILED — ${err.message}`)
      stats.failed++
    }
  }

  // Summary
  console.log("\n─────────────────────────────────────────")
  console.log(`  ✅  OK      : ${stats.ok}`)
  console.log(`  ❌  Failed  : ${stats.failed}`)
  if (stats.failed > 0) process.exit(1)
  console.log("\n  Done. product_embeddings table is ready for semantic search.")
}

main().catch((err) => {
  console.error(`\n❌  Fatal error: ${err.message}`)
  process.exit(1)
})
