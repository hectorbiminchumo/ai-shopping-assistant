/**
 * Test voyage-multimodal-3.5 image embedding generation end to end.
 *
 *   cd apps/chatbot-core
 *   node --env-file=.env scripts/test-image-embedding.mjs <path-to-image> [--dry-run]
 *
 * --dry-run (default): generate the embedding and print its shape only —
 *                      never touches pgvector. Use it to verify the Voyage
 *                      multimodal API + output_dimension before ingestion.
 *
 * Verifies:
 *   1. Voyage multimodal API responds successfully
 *   2. Embedding dimension = 512 (matches image_embedding vector(512) column)
 */
import { readFile } from "node:fs/promises"

const MODEL = process.env.VOYAGE_MULTIMODAL_MODEL || "voyage-multimodal-3.5"
const BASE_URL = process.env.VOYAGE_API_BASE_URL || "https://api.voyageai.com/v1"
const DIM = 512

const apiKey = process.env.VOYAGE_API_KEY
if (!apiKey) {
  console.error("❌  VOYAGE_API_KEY not set")
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = !args.includes("--no-dry-run") // dry-run is the only mode for now
const imagePath = args.find((a) => !a.startsWith("--"))
if (!imagePath) {
  console.error("❌  Usage: node scripts/test-image-embedding.mjs <path-to-image> [--dry-run]")
  process.exit(1)
}

function detectMimeType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  if (buf.toString("ascii", 0, 4) === "GIF8") return "image/gif"
  throw new Error("Unsupported image format — expected JPEG, PNG, WEBP, or GIF")
}

const image = await readFile(imagePath)
const dataUrl = `data:${detectMimeType(image)};base64,${image.toString("base64")}`

console.log(`Sending ${imagePath} (${(image.length / 1024).toFixed(1)} KB) to ${MODEL}…`)

const res = await fetch(`${BASE_URL}/multimodalembeddings`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    inputs: [{ content: [{ type: "image_base64", image_base64: dataUrl }] }],
    model: MODEL,
    output_dimension: DIM,
  }),
})

if (!res.ok) {
  console.error(`❌  Voyage API error ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const body = await res.json()
const embedding = body.data?.[0]?.embedding

if (!embedding) {
  console.error("❌  Empty response from Voyage multimodal API")
  process.exit(1)
}

console.log(`✅  Image embedding generated successfully`)
console.log(`    Dimension : ${embedding.length}  (expected ${DIM})`)
console.log(`    First 5 values: [${embedding.slice(0, 5).map((n) => n.toFixed(6)).join(", ")}]`)
console.log(`    Mode      : ${dryRun ? "dry-run (nothing written to pgvector)" : "live"}`)

if (embedding.length !== DIM) {
  console.error(`❌  Dimension mismatch — image_embedding column expects ${DIM}`)
  process.exit(1)
}
