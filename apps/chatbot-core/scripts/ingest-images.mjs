/**
 * Backfill image_embedding (voyage-multimodal-3.5, 512d) for the whole catalog.
 *
 * Feature 2 (image-based search). Products already exist in product_embeddings
 * from text ingestion — this only fills the image_embedding column. Images are
 * downloaded from Supabase Storage directly, mapped to products by title via
 * the seed CSV.
 *
 * Usage:
 *   cd apps/chatbot-core
 *   node --env-file=.env scripts/ingest-images.mjs --csv ../backend/scripts/data/products.csv --dry-run
 *   node --env-file=.env scripts/ingest-images.mjs --csv ../backend/scripts/data/products.csv
 *
 * --dry-run : download + embed every image but write nothing to Supabase.
 *
 * This is the "images-only" pass: it never touches text embeddings.
 *
 * Env vars required: VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  loadConfig,
  parseImageMap,
  createImageEmbedder,
  createSupabaseImageStore,
  runImageIngestion,
} from "./lib/image-ingest-helpers.js"

function parseArgs(argv) {
  const csv = argv[argv.indexOf("--csv") + 1]
  const dryRun = argv.includes("--dry-run")
  // Requests per minute cap. Voyage free tier (no payment method) is 3 RPM;
  // pass a higher value once the account has standard limits. 0 disables it.
  const rpmArg = argv.indexOf("--rpm")
  const rpm = rpmArg !== -1 ? Number(argv[rpmArg + 1]) : 3
  if (!csv || csv.startsWith("--")) {
    throw new Error(
      "--csv <path> is required. Example: node --env-file=.env scripts/ingest-images.mjs --csv ../backend/scripts/data/products.csv"
    )
  }
  // One extra second of headroom so bursts never cross the per-minute boundary.
  const delayMs = rpm > 0 ? Math.ceil(60000 / rpm) + 1000 : 0
  return { csv, dryRun, delayMs, rpm }
}

function logProgress(e) {
  const label = `[${e.index + 1}/${e.total}] ${e.title}`
  if (e.status === "dry-run") console.log(`  ${label}… ✅  embedded ${e.dim}d (dry-run)`)
  else if (e.status === "ok") console.log(`  ${label}… ✅  ${e.dim}d upserted`)
  else if (e.status === "skipped") console.log(`  ${label}… ⏭️  skipped (${e.reason})`)
  else if (e.status === "failed") console.log(`  ${label}… ❌  FAILED — ${e.error}`)
}

async function main() {
  const { csv, dryRun, delayMs, rpm } = parseArgs(process.argv.slice(2))
  const config = loadConfig(process.env)

  console.log(`\n🖼️   Image embedding backfill (${config.model})`)
  console.log(`    Mode: ${dryRun ? "DRY RUN — no writes to Supabase" : "LIVE — writing to Supabase"}`)
  console.log(`    Throttle: ${rpm > 0 ? `${rpm} req/min (~${(delayMs / 1000).toFixed(0)}s between images)` : "off"}\n`)

  const imageMap = parseImageMap(readFileSync(csv, "utf-8"))
  console.log(`📄  ${imageMap.size} title→image URLs from ${csv}`)

  const store = createSupabaseImageStore({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  })
  const embedder = createImageEmbedder({
    apiKey: config.voyageApiKey,
    model: config.model,
    baseUrl: config.voyageBaseUrl,
  })

  const products = await store.listProducts()
  const withUrl = products.filter((p) => imageMap.has(p.title)).length
  const etaMin = delayMs > 0 ? Math.ceil((withUrl * delayMs) / 60000) : 0
  console.log(`📦  ${products.length} products in product_embeddings (${withUrl} with an image URL)`)
  if (etaMin > 0) console.log(`⏱️   ETA ~${etaMin} min at ${rpm} req/min\n`)

  const stats = await runImageIngestion(
    { products, imageMap, dryRun, embedder, store, delayMs },
    { onProgress: logProgress }
  )

  console.log("\n─────────────────────────────────────────")
  console.log(`  ✅  Embedded : ${stats.ok}`)
  console.log(`  ⏭️  Skipped  : ${stats.skipped}`)
  console.log(`  ❌  Failed   : ${stats.failed}`)

  if (!dryRun) {
    const indexed = await store.countIndexed()
    console.log(`\n🔎  Verification: ${indexed}/${products.length} products now have a non-null image_embedding`)
    if (indexed < products.length) {
      console.log("  ⚠️  Some products are still missing an image embedding (see skips/failures above).")
    }
  }

  if (stats.failed > 0) process.exit(1)
  console.log("\n  Done.")
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n❌  Fatal error: ${err.message}`)
    process.exit(1)
  })
}
