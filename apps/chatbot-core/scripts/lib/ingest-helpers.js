/**
 * Pure/testable helpers for scripts/ingest-products.mjs.
 *
 * Written as CommonJS (not .mjs) so it can be consumed two ways with no build
 * step and no Jest ESM config:
 *   - the ESM CLI script imports named bindings from it (Node's ESM loader
 *     supports named imports from a CJS module using the `module.exports = {}`
 *     object-literal form)
 *   - Jest test files `require()` it directly like any other CJS module
 */

// ── CLI args / env config ──────────────────────────────────────────────────

function parseArgs(argv) {
  const fileArg = argv[argv.indexOf("--file") + 1]
  const dryRun = argv.includes("--dry-run")

  if (!fileArg) {
    throw new Error(
      "--file <path> is required. Example: node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json"
    )
  }

  return { fileArg, dryRun }
}

function loadConfig(env) {
  const voyageApiKey = env.VOYAGE_API_KEY
  const supabaseUrl = env.SUPABASE_URL
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const medusaBackendUrl = (env.MEDUSA_BACKEND_URL ?? "http://localhost:9000").replace(/\/$/, "")
  const medusaAdminEmail = env.MEDUSA_ADMIN_EMAIL
  const medusaAdminPassword = env.MEDUSA_ADMIN_PASSWORD

  const missing = [
    !voyageApiKey && "VOYAGE_API_KEY",
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`)
  }

  return {
    voyageApiKey,
    supabaseUrl,
    supabaseServiceRoleKey,
    medusaBackendUrl,
    medusaAdminEmail,
    medusaAdminPassword,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function buildEmbeddingRow(product, embedding, now = () => new Date().toISOString()) {
  const sizes = Array.isArray(product.sizes)
    ? [...new Set(product.sizes.map((s) => String(s).trim()).filter(Boolean))]
    : null

  return {
    medusa_product_id: product.medusa_product_id,
    title: product.title,
    description: product.description,
    category: product.category ?? null,
    tags: product.tags ?? [],
    available_sizes: sizes && sizes.length > 0 ? sizes : null,
    price_min: product.price_min ?? null,
    price_max: product.price_max ?? null,
    thumbnail_url: product.thumbnail_url ?? null,
    embedding,
    updated_at: now(),
  }
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
      // CSV uses pipe-separated values: "trail|road|lightweight", "38|40|42"
      tags: row.tags ? row.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
      sizes: row.sizes ? row.sizes.split("|").map((s) => s.trim()).filter(Boolean) : undefined,
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

// ── Medusa client ─────────────────────────────────────────────────────────────

function createMedusaClient({ backendUrl, adminEmail, adminPassword, fetchImpl = fetch }) {
  let token = null
  const idCache = new Map() // title → medusa product id

  async function getToken() {
    if (token) return token
    if (!adminEmail || !adminPassword) return null

    const res = await fetchImpl(`${backendUrl}/auth/user/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    const data = await res.json()
    token = data.token ?? null
    return token
  }

  async function fetchProductId(title) {
    if (idCache.has(title)) return idCache.get(title)

    const authToken = await getToken()
    if (!authToken) return null

    const res = await fetchImpl(
      `${backendUrl}/admin/products?q=${encodeURIComponent(title)}&limit=5`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
    const data = await res.json()
    const product = data.products?.find((p) => p.title === title)
    const id = product?.id ?? null
    if (id) idCache.set(title, id)
    return id
  }

  return { getToken, fetchProductId }
}

async function resolveMedusaIds(products, medusaClient) {
  for (const p of products) {
    if (!p.medusa_product_id) {
      p.medusa_product_id = (await medusaClient.fetchProductId(p.title)) ?? undefined
    }
  }
  return products.filter((p) => !p.medusa_product_id).length
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

function createSupabaseUpserter({ url, serviceRoleKey, fetchImpl = fetch }) {
  // Use PostgREST directly — avoids the WebSocket/Realtime init that
  // @supabase/supabase-js triggers on Node.js < 22.
  const restUrl = `${url.replace(/\/$/, "")}/rest/v1`
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceRoleKey}`,
    "apikey": serviceRoleKey,
    "Prefer": "resolution=merge-duplicates",
  }

  async function upsertEmbedding(row) {
    const res = await fetchImpl(`${restUrl}/product_embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify(row),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Supabase upsert failed: ${res.status} — ${body}`)
    }
  }

  return { upsertEmbedding }
}

// ── Voyage AI embedder ────────────────────────────────────────────────────────

function createVoyageEmbedder({ voyage, model = "voyage-3", retry = withRetry, maxRetries = 3, baseDelayMs = 1000 }) {
  async function embedBatch(chunks) {
    return retry(
      () =>
        voyage.embed({ input: chunks, model }).then((r) => {
          if (!r.data?.length) throw new Error("Empty batch response from Voyage AI")
          return r.data.map((d) => {
            if (!d.embedding) throw new Error("Missing embedding in batch response")
            return d.embedding
          })
        }),
      "batch embed",
      maxRetries,
      baseDelayMs
    )
  }

  return { embedBatch }
}

// ── Orchestration ─────────────────────────────────────────────────────────────

async function runIngestion(products, { dryRun, medusaClient, embedder, supabaseUpserter }, { onProgress = () => {} } = {}) {
  const stats = { ok: 0, failed: 0 }

  if (!dryRun) {
    onProgress({ type: "medusa-resolving" })
    const missingCount = await resolveMedusaIds(products, medusaClient)
    onProgress({ type: "medusa-resolved", missingCount })
  }

  onProgress({ type: "embeddings-generating" })
  const chunks = products.map(buildEmbeddingText)

  let embeddings
  if (dryRun) {
    embeddings = products.map(() => Array(1024).fill(0))
  } else {
    embeddings = await embedder.embedBatch(chunks)
  }
  onProgress({ type: "embeddings-generated", count: embeddings.length, dim: embeddings[0]?.length })

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const embedding = embeddings[i]
    const total = products.length

    if (dryRun) {
      onProgress({ type: "product-result", index: i, total, title: p.title, status: "dry-run" })
      stats.ok++
      continue
    }

    if (!p.medusa_product_id) {
      onProgress({ type: "product-result", index: i, total, title: p.title, status: "skipped" })
      stats.failed++
      continue
    }

    try {
      await supabaseUpserter.upsertEmbedding(buildEmbeddingRow(p, embedding))
      onProgress({ type: "product-result", index: i, total, title: p.title, status: "ok" })
      stats.ok++
    } catch (err) {
      onProgress({ type: "product-result", index: i, total, title: p.title, status: "failed", error: err.message })
      stats.failed++
    }
  }

  return stats
}

module.exports = {
  parseArgs,
  loadConfig,
  buildEmbeddingText,
  buildEmbeddingRow,
  withRetry,
  parseJson,
  parseCsv,
  splitCsvLine,
  validateProduct,
  createMedusaClient,
  resolveMedusaIds,
  createSupabaseUpserter,
  createVoyageEmbedder,
  runIngestion,
}
