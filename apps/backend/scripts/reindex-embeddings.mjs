/**
 * Re-indexes product_embeddings with rich OpenAI-generated descriptions.
 *
 * For each product it:
 *   1. Reads current title / category / tags from product_embeddings
 *   2. Generates a rich 150-word description via gpt-4o-mini
 *   3. Builds a chunk: title + rich description + category + tags
 *   4. Embeds the chunk with Voyage AI (voyage-3, 1024d)
 *   5. Upserts the new description + embedding back to product_embeddings
 *
 * Usage (from apps/backend/):
 *   node --env-file=.env scripts/reindex-embeddings.mjs [--dry-run] [--limit N]
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, VOYAGE_API_KEY, VOYAGE_MODEL
 */

// ── Config ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY    = process.env.OPENAI_API_KEY
const VOYAGE_KEY    = process.env.VOYAGE_API_KEY
const VOYAGE_MODEL  = process.env.VOYAGE_MODEL ?? "voyage-3"
const OPENAI_MODEL  = "gpt-4o-mini"

const args    = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const LIMIT   = Number(args[args.indexOf("--limit") + 1] ?? 9999)

// Voyage AI free tier: 3 RPM / 10K TPM — use small batches with wait between them
const EMBED_BATCH_SIZE  = 8
const EMBED_BATCH_DELAY = 22000 // ms between Voyage AI requests (3 RPM = 20s min)

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY || !VOYAGE_KEY) {
  console.error("❌  Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, VOYAGE_API_KEY")
  process.exit(1)
}

const SUPABASE_HEADERS = {
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type":  "application/json",
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchProducts() {
  const url = `${SUPABASE_URL}/rest/v1/product_embeddings?select=medusa_product_id,title,description,category,tags&limit=200`
  const res = await fetch(url, { headers: SUPABASE_HEADERS })
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function generateRichDescription(title, category, tags) {
  const tagList = (tags ?? []).join(", ")
  const prompt = [
    `You are a sportswear product copywriter. Write a rich product description of exactly 150–180 words for the following item.`,
    `It must describe: the garment type and silhouette, the ideal sport or activity it suits, the target user (gender, age, level),`,
    `the likely materials and construction, the fit and comfort features, and the conditions (season, weather, intensity) it is made for.`,
    `Do NOT mention price, collection year, or availability. Write in English, plain prose, no bullet points.`,
    ``,
    `Product title: ${title}`,
    `Category: ${category ?? "sportswear"}`,
    `Tags: ${tagList || "none"}`,
  ].join("\n")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 280,
      temperature: 0.7,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.choices[0].message.content.trim()
}

function buildChunk(title, description, category, tags) {
  return [title, description, category ?? "", (tags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n")
}

async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
  })
  if (!res.ok) throw new Error(`Voyage AI error: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.data.map((d) => d.embedding)
}

async function upsertBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/product_embeddings?on_conflict=medusa_product_id`
  const res = await fetch(url, {
    method: "POST",
    headers: { ...SUPABASE_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status} ${await res.text()}`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Crash-safety: save/load generated descriptions from disk ──────────────────

import { readFileSync, writeFileSync, existsSync } from "node:fs"

const CACHE_FILE = "./scripts/data/.reindex-cache.json"

function saveCache(enriched) {
  writeFileSync(CACHE_FILE, JSON.stringify(enriched, null, 2))
}

function loadCache(products) {
  if (!existsSync(CACHE_FILE)) return null
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"))
    if (cached.length === products.length) {
      console.log(`  ↩️  Resuming from cache (${CACHE_FILE})`)
      return cached
    }
  } catch {}
  return null
}

// ── Main ───────────────────────────────────────────────────────────────────────

import { mkdirSync } from "node:fs"
mkdirSync("./scripts/data", { recursive: true })

const products = (await fetchProducts()).slice(0, LIMIT)
console.log(`\n📦  Found ${products.length} products to re-index${DRY_RUN ? " (dry-run — skipping writes)" : ""}`)

// Step 1: generate rich descriptions via OpenAI (cached to disk for crash safety)
let enriched = loadCache(products)
if (!enriched) {
  console.log("\n🤖  Generating rich descriptions with OpenAI…")
  enriched = []
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${products.length}] ${p.title.substring(0, 60).padEnd(60)} `)
    try {
      const richDescription = await generateRichDescription(p.title, p.category, p.tags)
      enriched.push({ ...p, richDescription })
      process.stdout.write("✓\n")
    } catch (err) {
      process.stdout.write(`✗ (${err.message})\n`)
      enriched.push({ ...p, richDescription: p.description })
    }
    if ((i + 1) % 10 === 0) await sleep(500)
  }
  saveCache(enriched)
  console.log(`  💾  Descriptions saved to ${CACHE_FILE}`)
}

// Step 2: build chunks and embed in batches
console.log("\n🔢  Generating embeddings with Voyage AI…")
const chunks = enriched.map((p) => buildChunk(p.title, p.richDescription, p.category, p.tags))
const allEmbeddings = []

for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
  const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
  const batchEnd = Math.min(i + EMBED_BATCH_SIZE, chunks.length)
  process.stdout.write(`  Embedding ${i + 1}–${batchEnd}… `)
  const embeddings = await embedBatch(batch)
  allEmbeddings.push(...embeddings)
  process.stdout.write("✓\n")
  if (batchEnd < chunks.length) {
    process.stdout.write(`  ⏳  Waiting ${EMBED_BATCH_DELAY / 1000}s (Voyage AI free tier rate limit)…\n`)
    await sleep(EMBED_BATCH_DELAY)
  }
}

// Step 3: upsert back to Supabase
if (!DRY_RUN) {
  console.log("\n⬆️   Upserting to Supabase…")
  const rows = enriched.map((p, i) => ({
    medusa_product_id: p.medusa_product_id,
    title:       p.title,
    description: p.richDescription,
    category:    p.category ?? null,
    tags:        p.tags ?? [],
    embedding:   allEmbeddings[i],
    updated_at:  new Date().toISOString(),
  }))

  // Upsert in batches of 20 (Supabase REST prefers smaller payloads)
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE)
    const batchEnd = Math.min(i + EMBED_BATCH_SIZE, rows.length)
    process.stdout.write(`  Upserting ${i + 1}–${batchEnd}… `)
    await upsertBatch(batch)
    process.stdout.write("✓\n")
  }
} else {
  console.log("\n⏭️   Dry-run: skipping upserts. Sample chunk for first product:")
  console.log(chunks[0].substring(0, 300))
}

console.log(`\n✅  Done. ${products.length} products re-indexed with rich descriptions.\n`)
