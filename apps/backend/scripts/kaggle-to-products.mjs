/**
 * Converts the Kaggle Fashion Product Images dataset into a products CSV
 * ready for seed-medusa.mjs. Uploads each image to Supabase Storage and
 * replaces the local path with a public URL.
 *
 * Dataset expected structure:
 *   <dataset-dir>/
 *     styles.csv        → product metadata (id, gender, articleType, etc.)
 *     images/           → product images named {id}.jpg
 *
 * Usage:
 *   node --env-file=.env scripts/kaggle-to-products.mjs \
 *     --dataset ./kaggle \
 *     --output  ./scripts/data/products.csv \
 *     --limit   100
 *
 * Env vars required (same .env as the backend):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const get = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined

const datasetDir = get("--dataset")
const outputFile = get("--output") ?? "./scripts/data/products.csv"
const limit      = Number(get("--limit") ?? 100)

if (!datasetDir) {
  console.error("❌  --dataset <path> is required")
  console.error("    Example: node --env-file=.env scripts/kaggle-to-products.mjs --dataset ./kaggle --output ./scripts/data/products.csv")
  process.exit(1)
}

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET                    = "product-images"

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌  Missing env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// Use the Storage REST API directly — avoids the WebSocket/Realtime
// initialization that @supabase/supabase-js triggers on Node.js < 22.
const STORAGE_URL = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`
const AUTH_HEADER = {
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: SUPABASE_SERVICE_ROLE_KEY,
}

// ── Sportswear filter ─────────────────────────────────────────────────────────

const SPORTS_ARTICLE_TYPES = new Set([
  "Sports Shoes", "Running Shoes", "Casual Shoes",
  "Track Pants", "Sports Top", "Sports Jacket",
  "Sweatshirts", "Shorts", "Tracksuits",
  "Jackets", "Windcheater", "Rain Jacket",
  "Tshirts", "Tops",
])

function isSportswear(row) {
  return row.usage === "Sports" || SPORTS_ARTICLE_TYPES.has(row.articleType)
}

// ── Category mapping ──────────────────────────────────────────────────────────

function toCategory(row) {
  const type = row.articleType?.toLowerCase() ?? ""
  if (type.includes("shoe") || type.includes("sneaker") || row.masterCategory === "Footwear") {
    return "running-shoes"
  }
  if (type.includes("jacket") || type.includes("windcheater") || type.includes("rain")) {
    return "jackets"
  }
  return "training-apparel"
}

// ── Size defaults by category ─────────────────────────────────────────────────

function defaultSizes(row) {
  if (row.masterCategory === "Footwear") return "38|39|40|41|42|43|44"
  return "S|M|L|XL"
}

// ── Price defaults by category ────────────────────────────────────────────────

function defaultPrice(row) {
  if (row.masterCategory === "Footwear") return "89.99"
  const type = row.articleType?.toLowerCase() ?? ""
  if (type.includes("jacket") || type.includes("windcheater")) return "79.99"
  return "49.99"
}

// ── Description builder ───────────────────────────────────────────────────────

function buildDescription(row) {
  const gender  = row.gender === "Unisex" ? "Unisex" : `${row.gender}'s`
  const colour  = row.baseColour ?? "multi-colour"
  const season  = row.season && row.season !== "Summer" ? ` Designed for ${row.season.toLowerCase()} conditions.` : ""
  return `${gender} ${row.articleType} in ${colour}.` +
    ` Ideal for sports and active training.` +
    ` Part of the ${row.year ?? "current"} collection.${season}` +
    ` Available in multiple sizes for the perfect fit.`
}

// ── Tags builder ──────────────────────────────────────────────────────────────

function buildTags(row) {
  return [
    row.articleType?.toLowerCase().replace(/\s+/g, "-"),
    row.gender?.toLowerCase(),
    row.baseColour?.toLowerCase(),
    row.usage?.toLowerCase(),
    row.subCategory?.toLowerCase().replace(/\s+/g, "-"),
  ].filter(Boolean).join("|")
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim()); current = ""
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function escapeCsvField(val) {
  const str = String(val ?? "")
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

// ── Supabase Storage REST API ─────────────────────────────────────────────────


async function uploadImage(localPath, fileName) {
  const buffer = readFileSync(localPath)
  const url    = `${STORAGE_URL}/object/${BUCKET}/${fileName}`
  if (process.env.DEBUG) console.log(`\n    → POST ${url}`)
  const res    = await fetch(url, {
    method:  "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body:    buffer,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload failed for ${fileName}: ${res.status} ${res.statusText} — ${body}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`
}

async function withRetry(fn, label, maxRetries = 3, baseDelayMs = 800) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn() } catch (err) {
      if (attempt === maxRetries) throw err
      const delay = baseDelayMs * 2 ** (attempt - 1)
      console.warn(`  ⚠️  ${label} — attempt ${attempt} failed. Retrying in ${delay}ms…`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀  Kaggle → Supabase Storage → products CSV`)
  console.log(`    Dataset : ${datasetDir}`)
  console.log(`    Output  : ${outputFile}`)
  console.log(`    Limit   : ${limit} products\n`)

  // Validate dataset structure
  const stylesPath = join(datasetDir, "styles.csv")
  const imagesDir  = join(datasetDir, "images")
  if (!existsSync(stylesPath)) throw new Error(`styles.csv not found at ${stylesPath}`)
  if (!existsSync(imagesDir))  throw new Error(`images/ folder not found at ${imagesDir}`)

  // Parse styles.csv
  const lines   = readFileSync(stylesPath, "utf-8").split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines[0])
  const rows    = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i] ?? ""]))
  })

  // Filter to sportswear + skip rows with missing image
  const sportswear = rows.filter((row) => {
    if (!isSportswear(row)) return false
    return existsSync(join(imagesDir, `${row.id}.jpg`))
  })

  console.log(`📄  ${rows.length} total products → ${sportswear.length} sportswear with images`)
  const selected = sportswear.slice(0, limit)
  console.log(`    Processing ${selected.length} products (limit: ${limit})\n`)

  // CSV header
  const csvHeader = "title,description,category,tags,thumbnail,images,sizes,colors,price_usd"
  const csvRows   = []
  const stats     = { ok: 0, failed: 0 }

  for (let i = 0; i < selected.length; i++) {
    const row   = selected[i]
    const label = `[${i + 1}/${selected.length}] ${row.productDisplayName}`
    process.stdout.write(`  ${label}… `)

    try {
      const localImg = join(imagesDir, `${row.id}.jpg`)
      const fileName = `${row.id}.jpg`

      const publicUrl = await withRetry(
        () => uploadImage(localImg, fileName),
        label
      )

      const csvRow = [
        escapeCsvField(row.productDisplayName),
        escapeCsvField(buildDescription(row)),
        escapeCsvField(toCategory(row)),
        escapeCsvField(buildTags(row)),
        escapeCsvField(publicUrl),          // thumbnail
        escapeCsvField(publicUrl),          // images (same URL; add more if dataset has extras)
        escapeCsvField(defaultSizes(row)),
        escapeCsvField(row.baseColour ?? ""),
        escapeCsvField(defaultPrice(row)),
      ].join(",")

      csvRows.push(csvRow)
      console.log(`✅  uploaded`)
      stats.ok++
    } catch (err) {
      console.log(`❌  FAILED — ${err.message}`)
      stats.failed++
    }
  }

  // Write output CSV
  const { writeFileSync } = await import("node:fs")
  writeFileSync(outputFile, [csvHeader, ...csvRows].join("\n"), "utf-8")

  console.log("\n─────────────────────────────────────────────────────────")
  console.log(`  ✅  OK      : ${stats.ok}`)
  console.log(`  ❌  Failed  : ${stats.failed}`)
  console.log(`  📄  Output  : ${outputFile}`)

  if (stats.ok > 0) {
    console.log(`
  Next step → seed these products into Medusa:
  node --env-file=.env scripts/seed-medusa.mjs --file ${outputFile} --dry-run
  node --env-file=.env scripts/seed-medusa.mjs --file ${outputFile}
`)
  }

  if (stats.failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(`\n❌  Fatal error: ${err.message}`)
  process.exit(1)
})
