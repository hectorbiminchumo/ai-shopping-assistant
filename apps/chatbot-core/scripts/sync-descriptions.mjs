/**
 * Copies enriched descriptions from product_embeddings → Medusa product table.
 * The product_embeddings descriptions are the high-quality versions generated
 * during ingestion (OpenAI/Gemini enriched). Medusa descriptions may be the
 * original short CSV text or duplicated content from the seed process.
 *
 * Usage:
 *   node --env-file=.env scripts/sync-descriptions.mjs --dry-run   ← preview only
 *   node --env-file=.env scripts/sync-descriptions.mjs             ← write to Supabase
 */

const dryRun = process.argv.includes("--dry-run")

const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const REST_URL = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`
const HEADERS = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey":        SUPABASE_SERVICE_ROLE_KEY,
}

async function fetchEmbeddings() {
  const res = await fetch(
    `${REST_URL}/product_embeddings?select=medusa_product_id,title,description&limit=1000`,
    { headers: HEADERS }
  )
  if (!res.ok) throw new Error(`Fetch product_embeddings failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchMedusaProducts() {
  const res = await fetch(
    `${REST_URL}/product?select=id,title,description&deleted_at=is.null&limit=1000`,
    { headers: HEADERS }
  )
  if (!res.ok) throw new Error(`Fetch product failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function updateMedusaDescription(productId, description) {
  const res = await fetch(`${REST_URL}/product?id=eq.${productId}`, {
    method:  "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body:    JSON.stringify({ description }),
  })
  if (!res.ok) throw new Error(`Update failed for ${productId}: ${res.status} ${await res.text()}`)
}

async function main() {
  console.log(`\n📝  Description sync — ${dryRun ? "DRY RUN" : "LIVE"}\n`)

  const [embeddings, medusaProducts] = await Promise.all([
    fetchEmbeddings(),
    fetchMedusaProducts(),
  ])

  const medusaById = new Map(medusaProducts.map((p) => [p.id, p]))

  console.log(`📦  product_embeddings: ${embeddings.length} rows`)
  console.log(`🏬  Medusa products:     ${medusaProducts.length} rows\n`)

  let toUpdate = 0
  let alreadyMatching = 0
  let notFound = 0

  for (const emb of embeddings) {
    const medusa = medusaById.get(emb.medusa_product_id)

    if (!medusa) {
      console.log(`  ⚠️   ${emb.title.slice(0, 50)}  — not found in Medusa (orphaned embedding, skipping)`)
      notFound++
      continue
    }

    if (medusa.description === emb.description) {
      alreadyMatching++
      continue
    }

    const oldSnippet = (medusa.description ?? "(empty)").slice(0, 80).replace(/\n/g, " ")
    const newSnippet = emb.description.slice(0, 80).replace(/\n/g, " ")
    console.log(`  →  ${medusa.title.slice(0, 50)}`)
    console.log(`     old: ${oldSnippet}`)
    console.log(`     new: ${newSnippet}`)
    console.log()

    if (!dryRun) {
      await updateMedusaDescription(medusa.id, emb.description)
    }
    toUpdate++
  }

  console.log(`─────────────────────────────────────────`)
  console.log(`  ${toUpdate} to update, ${alreadyMatching} already matching, ${notFound} not found in Medusa`)

  if (dryRun) {
    console.log(`\n  Preview only — run without --dry-run to apply changes`)
  } else {
    console.log(`\n  ✅  Done — ${toUpdate} Medusa products updated`)
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err.message}`)
  process.exit(1)
})
