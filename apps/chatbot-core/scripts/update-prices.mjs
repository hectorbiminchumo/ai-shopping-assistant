/**
 * Assigns realistic prices to product_embeddings rows based on title/category.
 *
 * Usage:
 *   node --env-file=.env scripts/update-prices.mjs --dry-run   ← preview only
 *   node --env-file=.env scripts/update-prices.mjs             ← write to Supabase
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

// ── Price rules ───────────────────────────────────────────────────────────────
// Each rule: [regex to match title (case-insensitive), [min, max]]
// First match wins — order matters (specific → general)

const PRICE_RULES = [
  // Footwear — expensive
  [/trail\s*(run|shoe|sneaker)/i,           [90,  200]],
  [/run(ning)?\s*(shoe|sneaker)/i,          [75,  180]],
  [/training\s*(shoe|sneaker)/i,            [65,  160]],
  [/shoe|sneaker|footwear|boot/i,           [55,  150]],

  // Tops
  [/jacket|windbreaker|rain\s*jacket/i,     [70,  180]],
  [/hoodie|sweatshirt|pullover/i,           [50,  120]],
  [/sports?\s*bra/i,                        [28,   70]],
  [/t[-\s]?shirt|tee\b/i,                   [20,   55]],
  [/tank|vest\b/i,                          [18,   45]],

  // Bottoms
  [/legging|tight/i,                        [35,   90]],
  [/jogger|sweat\s*pant/i,                  [40,   85]],
  [/short/i,                                [22,   60]],
  [/pant|trouser/i,                         [40,   90]],

  // Accessories
  [/cap|hat|beanie/i,                       [18,   45]],
  [/bag|backpack|duffel/i,                  [35,  100]],
  [/sock/i,                                 [10,   28]],
  [/glove/i,                                [18,   50]],

  // Fallback
  [/.*/,                                    [35,   90]],
]

// Brand premium multipliers
const BRAND_MULTIPLIERS = [
  [/\b(nike|adidas)\b/i,            1.35],
  [/\b(puma|reebok|under armour)\b/i, 1.15],
  [/\b(new balance|asics|saucony)\b/i, 1.20],
]

function assignPrice(title, category) {
  const text = `${title} ${category ?? ""}`

  const [min, max] = PRICE_RULES.find(([re]) => re.test(text))[1]

  // Apply brand multiplier
  const multiplier = BRAND_MULTIPLIERS.find(([re]) => re.test(text))?.[1] ?? 1.0

  // Add per-product variation so products in the same category aren't identical
  // Use a simple hash of the title to get a stable offset
  const hash = [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const spread = max - min
  const offset = (hash % 11) / 10 // 0.0 – 1.0 deterministic

  const price = Math.round((min + spread * (0.2 + 0.6 * offset)) * multiplier)

  return { priceMin: price, priceMax: price }
}

// ── Fetch all products from Supabase ─────────────────────────────────────────

async function fetchProducts() {
  const res = await fetch(`${REST_URL}/product_embeddings?select=id,title,category,price_min,price_max`, {
    headers: HEADERS,
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function updatePrice(id, priceMin, priceMax) {
  const res = await fetch(`${REST_URL}/product_embeddings?id=eq.${id}`, {
    method:  "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body:    JSON.stringify({ price_min: priceMin, price_max: priceMax }),
  })
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n💰  Price updater — ${dryRun ? "DRY RUN" : "LIVE"}\n`)

  const products = await fetchProducts()
  console.log(`📦  Found ${products.length} products\n`)

  let updated = 0

  for (const p of products) {
    const { priceMin, priceMax } = assignPrice(p.title, p.category)

    const changed = p.price_min !== priceMin || p.price_max !== priceMax
    const tag = changed ? "→" : "="

    console.log(
      `  ${tag}  ${p.title.padEnd(50).slice(0, 50)}  $${String(priceMin).padStart(3)}–$${priceMax}`
        + (changed ? "" : "  (unchanged)")
    )

    if (!dryRun && changed) {
      await updatePrice(p.id, priceMin, priceMax)
      updated++
    }
  }

  console.log(`\n─────────────────────────────────────────`)
  if (dryRun) {
    console.log(`  Preview only — run without --dry-run to apply changes`)
  } else {
    console.log(`  ✅  Updated ${updated} products`)
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err.message}`)
  process.exit(1)
})
