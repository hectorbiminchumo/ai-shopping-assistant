/**
 * Seed the Medusa product catalog from a JSON or CSV file via the Admin API.
 *
 * Usage:
 *   node scripts/seed-medusa.mjs --file ./scripts/data/products.json
 *   node scripts/seed-medusa.mjs --file ./scripts/data/products.csv
 *   node scripts/seed-medusa.mjs --file ./scripts/data/products.json --dry-run
 *   node scripts/seed-medusa.mjs --file ./scripts/data/products.json --backend-url http://localhost:9000
 *
 * CSV format (use | as separator for multi-value fields):
 *   title,description,category,tags,thumbnail,images,sizes,colors,price_usd
 *   "Trail Shoes","Description...",running-shoes,trail|running,https://img.jpg,https://img.jpg|https://img2.jpg,40|41|42,Black|Blue,89.99
 *
 *   The script auto-generates all size × color combinations as variants.
 *   images column: all product images pipe-separated (thumbnail can be repeated or omitted).
 *
 * Env vars required (add to .env):
 *   MEDUSA_ADMIN_EMAIL      → admin account email
 *   MEDUSA_ADMIN_PASSWORD   → admin account password
 *   MEDUSA_BACKEND_URL      → defaults to http://localhost:9000
 *
 * Safe to re-run — products with the same handle are skipped.
 * After running this script, run chatbot-core's ingest-products.mjs
 * to generate embeddings for the products you just created.
 */

import { readFileSync } from "node:fs"
import { extname } from "node:path"

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const fileArg = args[args.indexOf("--file") + 1]
const dryRun = args.includes("--dry-run")
const backendUrlArg = args.includes("--backend-url")
  ? args[args.indexOf("--backend-url") + 1]
  : undefined

if (!fileArg) {
  console.error("❌  --file <path> is required")
  console.error("    Example: node scripts/seed-medusa.mjs --file ./scripts/data/products.json")
  process.exit(1)
}

// ── Env validation ────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD
const BACKEND_URL = (backendUrlArg || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

const missing = [
  !ADMIN_EMAIL && "MEDUSA_ADMIN_EMAIL",
  !ADMIN_PASSWORD && "MEDUSA_ADMIN_PASSWORD",
].filter(Boolean)

if (missing.length) {
  console.error(`❌  Missing env vars: ${missing.join(", ")}`)
  console.error("    Add them to your .env file and run: node --env-file=.env scripts/seed-medusa.mjs …")
  process.exit(1)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { message: text } }

  return { ok: res.ok, status: res.status, data: json }
}

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

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authenticate() {
  const { ok, data } = await request("POST", "/auth/user/emailpass", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })

  if (!ok || !data.token) {
    throw new Error(`Auth failed — check MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD. ${data.message ?? ""}`)
  }

  return data.token
}

// ── Categories ────────────────────────────────────────────────────────────────

const categoryCache = new Map() // name → id
const tagCache = new Map()      // value → id

async function getCategoryId(name, token) {
  if (categoryCache.has(name)) return categoryCache.get(name)

  // Try to find existing category
  const handle = slugify(name)
  const { data: listData } = await request("GET", `/admin/product-categories?handle=${handle}`, null, token)
  const existing = listData.product_categories?.[0]

  if (existing) {
    categoryCache.set(name, existing.id)
    return existing.id
  }

  // Create it
  const { ok, data: created } = await request(
    "POST",
    "/admin/product-categories",
    { name, handle, is_active: true, is_internal: false },
    token
  )
  if (!ok) throw new Error(`Failed to create category "${name}": ${created.message}`)

  const id = created.product_category.id
  categoryCache.set(name, id)
  return id
}

async function getTagId(value, token) {
  if (tagCache.has(value)) return tagCache.get(value)

  const { data: listData } = await request("GET", `/admin/product-tags?value=${encodeURIComponent(value)}`, null, token)
  const existing = listData.product_tags?.[0]

  if (existing) {
    tagCache.set(value, existing.id)
    return existing.id
  }

  const { ok, data: created } = await request("POST", "/admin/product-tags", { value }, token)
  if (!ok) throw new Error(`Failed to create tag "${value}": ${created.message}`)

  const id = created.product_tag.id
  tagCache.set(value, id)
  return id
}

// ── Data transformation ───────────────────────────────────────────────────────

/** Converts a product from the JSON file format into the Medusa Admin API payload. */
async function toMedusaPayload(product, token) {
  // Categories — skipped in dry-run (no token available)
  const categories = []
  if (product.category && token) {
    const id = await getCategoryId(product.category, token)
    categories.push({ id })
  }

  // Options + Variants
  const optionTitles = Object.keys(product.options ?? {})

  const options = optionTitles.map((title) => ({
    title,
    values: product.options[title],
  }))

  const variants = (product.variants ?? []).map((v) => {
    const optionValues = {}
    if (v.size !== undefined) optionValues["Size"] = String(v.size)
    if (v.color !== undefined) optionValues["Color"] = v.color

    return {
      title: Object.values(optionValues).join(" / ") || v.sku || "Default",
      sku: v.sku ?? undefined,
      manage_inventory: false,
      prices: [
        {
          amount: Math.round((v.price_usd ?? 0) * 100), // Medusa stores cents
          currency_code: "usd",
        },
      ],
      options: optionValues,
    }
  })

  return {
    title: product.title,
    description: product.description,
    status: "published",
    thumbnail: product.thumbnail ?? undefined,
    images: (product.images ?? []).map((url) => ({ url })),
    options,
    variants,
    tags: token
      ? await Promise.all((product.tags ?? []).map((v) => getTagId(v, token).then((id) => ({ id }))))
      : [],
    categories,
  }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

// ── Duplicate check ───────────────────────────────────────────────────────────

async function findProduct(title, token) {
  const { data } = await request(
    "GET",
    `/admin/products?q=${encodeURIComponent(title)}&limit=5`,
    null,
    token
  )
  // exact title match — avoids false positives from partial search
  return data.products?.find((p) => p.title === title) ?? null
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())

  return lines.slice(1).map((line, i) => {
    const values = splitCsvLine(line)
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${i + 2}: expected ${headers.length} columns, got ${values.length}`)
    }

    const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx].trim()]))

    const pipe = (field) => (row[field] ? row[field].split("|").map((s) => s.trim()).filter(Boolean) : [])

    const sizes = pipe("sizes")
    const colors = pipe("colors")
    const price = Number(row.price_usd ?? 0)

    // Auto-generate all size × color combinations as variants
    const variants = []
    if (sizes.length && colors.length) {
      for (const size of sizes) {
        for (const color of colors) {
          variants.push({ size, color, price_usd: price })
        }
      }
    } else if (sizes.length) {
      for (const size of sizes) variants.push({ size, price_usd: price })
    } else {
      variants.push({ price_usd: price })
    }

    // Build options object only for axes that have values
    const options = {}
    if (sizes.length) options["Size"] = sizes
    if (colors.length) options["Color"] = colors

    return {
      title: row.title,
      description: row.description,
      category: row.category || undefined,
      tags: pipe("tags"),
      thumbnail: row.thumbnail || undefined,
      images: pipe("images"),
      options,
      variants,
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
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
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
  if (!product.variants?.length) errors.push("at least one variant is required")
  if (errors.length) throw new Error(`Product at index ${index}: ${errors.join(", ")}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀  Medusa product seed script`)
  console.log(`    Backend : ${BACKEND_URL}`)
  if (dryRun) console.log("    Mode    : DRY RUN — no writes to Medusa\n")
  else console.log("    Mode    : LIVE — creating products in Medusa\n")

  // Load + parse file
  const raw = readFileSync(fileArg, "utf-8")
  const ext = extname(fileArg).toLowerCase()
  const products = ext === ".csv" ? parseCsv(raw) : JSON.parse(raw)
  if (!Array.isArray(products)) throw new Error("JSON file must be an array of products")

  console.log(`📄  Loaded ${products.length} products from ${fileArg}\n`)

  // Validate all upfront
  products.forEach(validateProduct)

  // Authenticate
  let token
  if (!dryRun) {
    process.stdout.write("🔑  Authenticating with Medusa Admin API… ")
    token = await withRetry(() => authenticate(), "auth")
    console.log("✅\n")
  }

  const stats = { ok: 0, skipped: 0, failed: 0 }

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const label = `[${i + 1}/${products.length}] ${p.title}`
    process.stdout.write(`  ${label}… `)

    try {
      if (dryRun) {
        const payload = await toMedusaPayload(p, null)
        console.log(`✅  (dry-run) ${payload.variants.length} variant(s)`)
        stats.ok++
        continue
      }

      const existing = await withRetry(() => findProduct(p.title, token), label)
      const payload  = await toMedusaPayload(p, token)

      if (existing) {
        // Update thumbnail + images only — variants and options stay unchanged
        const { ok, data } = await withRetry(
          () => request("POST", `/admin/products/${existing.id}`, {
            thumbnail: payload.thumbnail,
            images: payload.images,
          }, token),
          label
        )
        if (!ok) throw new Error(data.message ?? JSON.stringify(data))
        console.log(`🔄  updated images`)
        stats.ok++
      } else {
        // Create new product
        const { ok, data } = await withRetry(
          () => request("POST", "/admin/products", payload, token),
          label
        )
        if (!ok) throw new Error(data.message ?? JSON.stringify(data))
        console.log(`✅  created (id: ${data.product.id})`)
        stats.ok++
      }
    } catch (err) {
      console.log(`❌  FAILED — ${err.message}`)
      stats.failed++
    }
  }

  // Summary
  console.log("\n─────────────────────────────────────────────────────────")
  console.log(`  ✅  Created/Updated : ${stats.ok}`)
  console.log(`  ❌  Failed          : ${stats.failed}`)

  if (!dryRun && stats.ok > 0) {
    console.log(`
  Next step → generate embeddings for these products:
  cd ../chatbot-core
  node --env-file=.env scripts/ingest-products.mjs --file ../backend/scripts/data/products.json
`)
  }

  if (stats.failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(`\n❌  Fatal error: ${err.message}`)
  process.exit(1)
})
