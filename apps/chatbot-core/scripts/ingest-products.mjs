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
import { pathToFileURL } from "node:url"
import { VoyageAIClient } from "voyageai"
import {
  parseArgs,
  loadConfig,
  parseJson,
  parseCsv,
  validateProduct,
  createMedusaClient,
  createSupabaseUpserter,
  createVoyageEmbedder,
  runIngestion,
} from "./lib/ingest-helpers.js"

function logProgress(event) {
  switch (event.type) {
    case "medusa-resolving":
      process.stdout.write(`🔑  Resolving Medusa product IDs… `)
      break
    case "medusa-resolved":
      console.log(event.missingCount > 0 ? `⚠️  ${event.missingCount} products not found in Medusa (will be skipped)` : `✅`)
      break
    case "embeddings-generating":
      console.log(`\n🧠  Generating embeddings (1 batch request to Voyage AI)… `)
      break
    case "embeddings-generated":
      console.log(`✅  ${event.count} embeddings generated (dim=${event.dim})\n`)
      break
    case "product-result": {
      const label = `[${event.index + 1}/${event.total}] ${event.title}`
      if (event.status === "dry-run") console.log(`  ${label}… ✅  (dry-run)`)
      else if (event.status === "skipped") console.log(`  ${label}… ⏭️  skipped (not found in Medusa)`)
      else if (event.status === "ok") console.log(`  ${label}… ✅  upserted`)
      else if (event.status === "failed") console.log(`  ${label}… ❌  FAILED — ${event.error}`)
      break
    }
  }
}

async function main() {
  const { fileArg, dryRun } = parseArgs(process.argv.slice(2))
  const config = loadConfig(process.env)

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

  const voyage = new VoyageAIClient({ apiKey: config.voyageApiKey })
  const medusaClient = createMedusaClient({
    backendUrl: config.medusaBackendUrl,
    adminEmail: config.medusaAdminEmail,
    adminPassword: config.medusaAdminPassword,
  })
  const supabaseUpserter = createSupabaseUpserter({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  })
  const embedder = createVoyageEmbedder({ voyage })

  const stats = await runIngestion(
    products,
    { dryRun, medusaClient, embedder, supabaseUpserter },
    { onProgress: logProgress }
  )

  // Summary
  console.log("\n─────────────────────────────────────────")
  console.log(`  ✅  OK      : ${stats.ok}`)
  console.log(`  ❌  Failed  : ${stats.failed}`)
  if (stats.failed > 0) process.exit(1)
  console.log("\n  Done. product_embeddings table is ready for semantic search.")
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n❌  Fatal error: ${err.message}`)
    process.exit(1)
  })
}
