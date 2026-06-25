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
import { createClient } from "@supabase/supabase-js"

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

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
  if (!product.medusa_product_id) errors.push("medusa_product_id is required")
  if (!product.title) errors.push("title is required")
  if (!product.description) errors.push("description is required")
  if (errors.length) {
    throw new Error(`Product at index ${index}: ${errors.join(", ")}`)
  }
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

  const stats = { ok: 0, skipped: 0, failed: 0 }

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const label = `[${i + 1}/${products.length}] ${p.title}`

    process.stdout.write(`  ${label}… `)

    try {
      // 1. Generate embedding
      const chunk = buildEmbeddingText(p)
      const embedding = await withRetry(
        () => voyage.embed({ input: [chunk], model: "voyage-3" }).then((r) => {
          const vec = r.data?.[0]?.embedding
          if (!vec) throw new Error("Empty embedding response")
          return vec
        }),
        label
      )

      if (dryRun) {
        console.log(`✅  (dry-run) embedding dim=${embedding.length}`)
        stats.ok++
        continue
      }

      // 2. Upsert into Supabase
      const { error } = await supabase.from("product_embeddings").upsert(
        {
          medusa_product_id: p.medusa_product_id,
          title: p.title,
          description: p.description,
          category: p.category ?? null,
          tags: p.tags ?? [],
          price_min: p.price_min ?? null,
          price_max: p.price_max ?? null,
          thumbnail_url: p.thumbnail_url ?? null,
          embedding,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "medusa_product_id" }
      )

      if (error) throw new Error(error.message)

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
  if (stats.failed > 0) {
    console.log("\n  Fix the errors above and re-run — duplicates will be skipped via upsert.")
    process.exit(1)
  }
  console.log("\n  Done. product_embeddings table is ready for semantic search.")
}

main().catch((err) => {
  console.error(`\n❌  Fatal error: ${err.message}`)
  process.exit(1)
})
