/**
 * 
 * cd apps/chatbot-core && node --env-file=.env scripts/test-embedding.mjs

 * Verifies:
 *   1. Voyage AI API responds successfully
 *   2. Embedding dimension = 1024 (matches pgvector column)
 */
import { VoyageAIClient } from "voyageai"

const apiKey = process.env.VOYAGE_API_KEY
if (!apiKey) {
  console.error("❌  VOYAGE_API_KEY not set")
  process.exit(1)
}

const client = new VoyageAIClient({ apiKey })

const sampleText =
  "Men's lightweight running shoes with breathable mesh upper, ideal for road running and daily training"

console.log("Sending request to Voyage AI…")

const response = await client.embed({ input: [sampleText], model: "voyage-3" })
const embedding = response.data?.[0]?.embedding

if (!embedding) {
  console.error("❌  Empty response from Voyage AI")
  process.exit(1)
}

console.log(`✅  Embedding generated successfully`)
console.log(`    Dimension : ${embedding.length}  (expected 1024)`)
console.log(`    First 5 values: [${embedding.slice(0, 5).map((n) => n.toFixed(6)).join(", ")}]`)

if (embedding.length !== 1024) {
  console.error(`❌  Dimension mismatch — pgvector column expects 1024`)
  process.exit(1)
}
