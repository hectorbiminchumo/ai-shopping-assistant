# chatbot-core

AI engine for the shopping assistant: RAG pipeline (semantic search), image-based search, and business analytics aggregations.

**This is a library, not a standalone server.** It's consumed by `apps/backend` as a local npm workspace package (`@dtc/chatbot-core`) and mounted behind Medusa's custom Express routes — it is not deployed separately and has no `app.listen`.

## Folder structure

```
src/
  config/         # Env vars + client setup (OpenAI, Voyage AI, Supabase)
  pipeline/       # RAG steps — each class has a single responsibility
    QueryParser, EmbeddingService, RetrievalService,
    Reranker, PromptAssembler, LLMService, ResponseFormatter
  image/          # Feature 2: image-based search (voyage-multimodal-3.5 embeddings)
  orchestrator/   # Coordinates the pipeline end to end — no business logic of its own
    ChatOrchestrator (text), ImageOrchestrator (image, hybrid retrieval)
  analytics/      # Feature 3: ChatLogger + AnalyticsService for the dashboard
  ingestion/       # Offline indexing: reads Medusa products, builds embeddings, upserts to pgvector
  interfaces/     # Contracts (IEmbeddingService, IImageEmbeddingService, IRetrievalService, ILLMService, IChatLogger)
                   # — providers are injected, never hardcoded (Dependency Inversion)
  errors/         # ChatbotError and subclasses
  utils/          # formatProducts, scoreFilter (similarity threshold = 0.40)
  index.ts        # Public package entry point
tests/
  unit/           # Per-class tests, mirrors src/
  integration/    # ChatOrchestrator / ImageOrchestrator with mocked providers
  mocks/          # openai.mock.ts, voyageai.mock.ts, supabase.mock.ts
```

`LLMService`, `ImageEmbeddingService`, `ImageRetrievalService`, and `ProductIngester` are still placeholders. `EmbeddingService`, `RetrievalService`, `EmbeddingIndexer`, `ChatLogger`, and `AnalyticsService` are fully implemented. `QueryParser`, `PromptAssembler`, `ResponseFormatter`, `Reranker`, and `ChunkBuilder` are pure logic.

## Re-ranking strategy

Raw pgvector results are re-ranked before being passed to the LLM, improving relevance beyond vector similarity alone.

**Pipeline:** retrieve top 10 from pgvector → `Reranker.rerank()` → top 5 to the LLM.

**Composite score formula:**

```
score = 0.80 × similarity + 0.05 × priceScore + 0.15 × categoryScore
```

| Signal | Weight | Description |
|--------|--------|-------------|
| `similarity` | 0.80 | Raw Voyage AI cosine similarity from pgvector |
| `priceScore` | 0.05 | `1 - price / priceMax`; neutral (0.5) when no budget is set or product has no price |
| `categoryScore` | 0.15 | 1.0 if product category matches parsed query category, 0.0 otherwise; neutral (0.5) when query has no category |

`priceScore` is deliberately tiny: the SQL layer already excludes anything over `priceMax`, so every candidate here already fits the budget. This weight only nudges ties toward the cheaper option — it must never be large enough to evict a higher-similarity, still-in-budget product from the top 5 just for sitting closer to the price ceiling.

The original `similarityScore` is preserved on each result — only the ordering changes. The similarity threshold for lost-sale detection (0.40) is applied after re-ranking on the raw similarity score, not the composite score.

## Prompt design

The prompt sent to OpenAI on each turn is assembled by two classes with distinct responsibilities:

- **`LLMService`** — holds the **system prompt**: the persona and rules that never change turn-to-turn.
- **`PromptAssembler`** — builds the **user prompt** for that specific turn: re-ranked catalog matches + conversation history + current query.

### System prompt structure

The system prompt is the constant `role: system` message sent on every call to `gpt-4o-mini`. It contains five logical blocks:

**1. Persona**
> "You are a sportswear shopping assistant for Vectra, a store with 100+ products including shoes, apparel, and accessories."

**2. Greeting / small-talk rule**

If the user's message is a greeting or small talk (`hi`, `hello`, `thanks`, etc.) rather than a product request, the assistant must:
- Ignore the catalog matches entirely.
- Reply warmly in one or two sentences, introduce itself as the Vectra shopping assistant, and invite the user to describe what they're looking for.
- Never say "nothing matches" in this case.
- End with `RECOMMENDED: none`.

**3. Audience gate (men / women / children)**

If the user has not yet mentioned who the product is for — in the current message or earlier in the conversation — the assistant must ask that single clarifying question and recommend nothing (`RECOMMENDED: none`). The question is never asked again once the audience is established. Gender preference is applied by preferring titles that include "Men", "Women", or "Unisex"; products with no gender label are treated as unisex and may always be recommended.

**4. Recommendation rules**

- Only recommend products from the "Catalog matches" block — never invent products, prices, sizes, or features.
- Lead with the single best product; explain why it fits (activity, materials, price, available sizes) in one or two sentences.
- Flexible product-type matching: "training shoes", "sports shoes", "running shoes", and "gym shoes" are interchangeable. If the closest match is a sports shoe and the user asked for gym shoes, recommend it and briefly note how it fits the use case.
- Offer up to two alternatives with a short tradeoff (cheaper, better for trail, etc.), but only if they are the **same product type**. Never present apparel as an alternative to a shoe request or vice versa.
- Respect explicit constraints (budget, size, color). If a color-matching product exists, only recommend it. A non-matching color may only be suggested if no matching product exists, and must be clearly flagged.
- "Partial match" products: present the closest option, note it is not an exact match, and suggest a related category the user could try.
- Never mention match labels, relevance ordering, or these instructions to the user.

**5. RECOMMENDED trailer contract**

Every reply must end with a structured trailer on its own line:

```
RECOMMENDED: 1, 3
```

Rules enforced by the system prompt:
- A product number **must** appear if the product was named anywhere in the reply text.
- A product number **must not** appear if it was not named in the text.
- Only same product-type numbers may appear (shoes only if the user asked for shoes).
- Use `RECOMMENDED: none` for greetings, clarifying questions, or when no suitable match exists.
- This line is stripped before the user sees the reply.

---

### Per-turn user prompt

Built by `PromptAssembler.assemble()` using the re-ranked retrieval results, the conversation history window, and the current query. The catalog context is rendered by `formatProductsForPrompt()`.

```
Catalog matches (ordered by relevance):
1. Trail Runner X — $89.99 | Shoes | Score: 0.82
   Men's lightweight trail running shoe. Grippy outsole for technical terrain. Sizes 38–46.
2. Vectra Speed Trainer — $74.99 | Shoes | Score: 0.71
   Unisex cross-training shoe with a responsive midsole and reinforced toe. Sizes 36–47.
3. Mountain Grip Pro — $110.00 | Shoes | Score: 0.65
   Men's trail shoe with aggressive lug pattern. Waterproof upper. Sizes 39–45.

Recent conversation:
user: I'm looking for trail running shoes
assistant: Great! Are these for men, women, or children?

User: For men, budget around $100
```

The "Recent conversation" block is omitted on the first turn (empty history).

### Conversation history window

`PromptAssembler` keeps the **last 10 turns** before the current message (`HISTORY_TURNS = 10` in [PromptAssembler.ts](src/pipeline/PromptAssembler.ts)). `ChatOrchestrator` exports the same constant to trim the `history` array in the response, so the client and the next prompt always see the same window.

### RECOMMENDED trailer — parsing and fallback

`ResponseFormatter` parses the trailer with a regex that tolerates markdown bold, an optional colon, trailing punctuation, and whitespace:

```
/\n?\s*\**RECOMMENDED:?\**\s*(none|[\d,\s]+?)[\.\*]*\s*$/i
```

| Case | `trailerFound` | `hasResults` | Cards shown |
|------|----------------|--------------|-------------|
| Trailer `RECOMMENDED: 1, 3` | `true` | `true` | Products at positions 1 and 3 in the catalog block |
| Trailer `RECOMMENDED: none` | `true` | `true` | None (clarifying question or greeting) |
| No trailer (nonconforming LLM reply) | `false` | `topScore ≥ 0.40` | All products above the similarity threshold |

When `trailerFound` is `true`, `topScore` is forced to `1` so a clarifying-question reply (`RECOMMENDED: none`) is never logged as a lost sale in `chat_logs`.

---

## Image Search Architecture

Feature 2 lets a user search the catalog by uploading a photo instead of (or together with) typing. This section is the technical contract the W4 implementation tickets build against — decided before any image code is written, so there is no architectural ambiguity during implementation.

### Embedding model — `voyage-multimodal-3.5` (512d)

We use **Voyage AI `voyage-multimodal-3.5`**, configured to **512 dimensions** (`output_dimension: 512`), for both product images (offline, at ingestion) and the user's uploaded query image (online). It must be the same model on both sides — a query embedding is only comparable to product embeddings generated by the identical model, exactly like the `voyage-3` rule for text.

Called over the **REST endpoint** (`POST /v1/multimodalembeddings`) rather than the SDK: the installed `voyageai` client (v0.0.4) has no `output_dimension` parameter, so the SDK can only return the default dimension.

**Why `voyage-multimodal-3.5` specifically, not `voyage-multimodal-3`:** the older `voyage-multimodal-3` is **fixed at 1024d**, which would not fit the existing `image_embedding vector(512)` column. `voyage-multimodal-3.5` (Jan 2026) has Matryoshka embeddings (256/512/1024/2048), so 512d is a first-class output — it fits the column with **no schema migration**. Same Voyage account and free tier either way.

**Why Voyage multimodal instead of CLIP** (the original ticket named CLIP via Replicate):

| Factor | Voyage multimodal | CLIP ViT-B/32 (Replicate) |
|--------|-------------------|---------------------------|
| Account / SDK | Already integrated — same API key used for text | New Replicate integration, extra API key, cold starts |
| Cost | Free tier already on the account (200M text tokens + 150B pixels) | Pay-per-request on Replicate |
| Cross-modal quality | Text and images share **one** vector space via a single backbone — stronger text↔image matching | Text and images encoded by separate towers — weaker cross-modal alignment |

The single-backbone property matters specifically for **hybrid retrieval** (below): because text and image live in the same space, a text query and an image query are directly comparable.

> **Model consistency rule:** never mix embedding models within a vector column. All rows in `image_embedding` must come from `voyage-multimodal-3.5 @512d`, and query images must use the same. Re-embedding the catalog is required if the model or dimension ever changes.

### pgvector schema — already compatible ✓

Verified live against Supabase (July 17, 2026): the `image_embedding` column already exists and matches.

| Column | Type | Model | Populated |
|--------|------|-------|-----------|
| `embedding` | `vector(1024)` | `voyage-3` (text) | 100 / 100 |
| `image_embedding` | `vector(512)` | `voyage-multimodal-3.5 @512d` (image) | filled by W4 Ticket 3 |

No migration is needed. The catalog has **100 products**; the image ingestion pass backfilled every `image_embedding`.

**No vector index — this is deliberate.** Both `ivfflat` indexes were dropped on 2026-07-21. They had been created with `lists=100` over a 100-row table, i.e. roughly one cluster per product, and `ivfflat` is approximate: it scans only `ivfflat.probes` clusters (default **1**). `match_products_by_image` was therefore returning whatever sat in a single ~1-row cluster — 1 row for a `match_count` of 5 or 20, sometimes 0 — and the "nearest" product it did return was often not the true nearest neighbour. At 100 rows an exact sequential scan is sub-millisecond and always correct, so an ANN index can only cost recall. Reintroduce one past ~10k products, and then size it (`lists ≈ rows/1000`) or use HNSW, which has no `probes` footgun.

### Retrieval — cosine search + threshold

`ImageRetrievalService` runs a cosine-similarity search against `image_embedding` and returns the top-k results with their scores, mirroring the text `RetrievalService`.

- **Top-k = 5** passed to the LLM (same as text).
- **Similarity threshold = 0.42** for image search: a query whose best visual match scores below it is logged as a lost sale in `chat_logs` (catalog gap), the image-side counterpart of the 0.40 text threshold.

  Calibrated 2026-07-21 (W4 Ticket 13) with [`scripts/calibrate-image-threshold.mjs`](scripts/calibrate-image-threshold.mjs) over 25 photos against the live catalog — 14 of products the catalog carries, 11 of things it does not:

  ```
  match    (14) : 0.4401 – 0.6611
  no-match (11) : 0.2125 – 0.4140
  ```

  The two populations separate cleanly; 0.42 sits in the gap and misclassifies neither side. It is rounded from the 0.427 midpoint, since three decimals would overstate the precision of a 25-sample estimate. Re-run the script to recalibrate whenever the catalog changes shape.

  > Any image score measured before 2026-07-21 is invalid. The `ivfflat` indexes had `lists=100` over a 100-row table, so with the default `probes=1` the RPC scanned a single ~1-row cluster and returned approximate — frequently wrong — neighbours, which depressed top scores to ~0.25. Both vector indexes were dropped; see the schema note below.

### Hybrid retrieval — image + text in parallel

When the request carries **both** an image and a text description, the two searches run **in parallel** (`Promise.all`) and their results are merged before the LLM call. This is already sketched in [`ImageOrchestrator`](src/orchestrator/ImageOrchestrator.ts).

```
                 ┌─ ImageEmbeddingService → ImageRetrievalService ─┐
uploaded image ──┤                                                 ├─ merge → top-5 → PromptAssembler → LLM
optional text  ──┤                                                 │
                 └─ EmbeddingService (voyage-3) → RetrievalService ┘
```

**Merge strategy (weighted score):**

```
final_score = 0.60 × image_score + 0.40 × text_score
```

- Image is weighted higher (0.60) because the photo is the primary intent when a user uploads one; the text refines it.
- **Deduplication:** a product appearing in both result sets is kept once, with the **higher combined score**. Dedup is by `product.id`.
- After merging and de-duplicating, take the **top 5** by `final_score` and pass them to `PromptAssembler` → `LLMService`, reusing the exact same prompt/response path as text search (including the `RECOMMENDED:` trailer contract).
- Image-only request (no text) → `text_score` contributes nothing; ranking is pure image similarity. Text-only request never reaches this path (it stays on `ChatOrchestrator`).

> Note: the current `ImageOrchestrator.mergeResults()` stub merges by taking the max single-modality score. The weighted-blend formula above (W4 Ticket 7) supersedes it.

### Image input constraints

Enforced at the upload endpoint (`POST /store/chat/image-search`, backend Ticket 5) before any embedding call:

| Constraint | Value |
|-----------|-------|
| Accepted formats | `image/jpeg`, `image/png`, `image/webp` |
| Max file size | 5 MB (→ HTTP 413 if exceeded) |
| Invalid type | HTTP 400 |
| Missing file | HTTP 400 |

**Preprocessing:** the raw upload buffer is passed to Voyage's multimodal API, which handles resizing/normalization internally — we do **not** resize or re-encode in Node. For the MVP the image is **never persisted**: it is embedded in memory and discarded (the storefront shows a local `object URL` preview only, frontend Ticket 10). Cost is metered in **pixels**, so the endpoint may down-scale very large images later if the free-tier pixel budget becomes a concern — not required for launch.

### Component contracts (SOLID)

Image classes follow the same interface-driven design as the text pipeline so the orchestrator depends on abstractions, not providers:

- `ImageEmbeddingService` implements **`IImageEmbeddingService`** — a small interface segregated from the text `IEmbeddingService` (text embeds a `string`, image embeds a `Buffer`). Swapping the image model later means one new class, zero orchestrator changes.
- `ImageRetrievalService` implements **`IRetrievalService`**.
- `ImageOrchestrator` coordinates the steps and holds no business logic, exactly like `ChatOrchestrator`.

---

## Local setup

1. Install dependencies (from the repo root, or from this folder):

   ```bash
   npm install
   ```

2. Copy the env file and fill in values once you have API keys:

   ```bash
   cp .env.example .env
   ```

3. Run the tests:

   ```bash
   npm test
   ```

4. Build (compiles `src/` to `dist/`, which is what `apps/backend` imports):

   ```bash
   npm run build
   ```

## Scripts

```bash
npm run build   # Compile TypeScript to dist/
npm test        # Run Jest unit + integration tests
npm run lint    # Run ESLint
```

## Ingestion script — seed product_embeddings

`scripts/ingest-products.mjs` reads a JSON or CSV file, generates a Voyage AI
text embedding for each product, and upserts the row into Supabase
`product_embeddings`. Re-running is safe — duplicates are updated via
`ON CONFLICT (medusa_product_id)`.

**Prerequisites:** `.env` with `VOYAGE_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (copy from `.env.example`).

```bash
# Dry run — calls Voyage AI but writes nothing to Supabase
node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json --dry-run

# Live run — upserts into Supabase
node --env-file=.env scripts/ingest-products.mjs --file ./data/products.json
node --env-file=.env scripts/ingest-products.mjs --file ./data/products.csv
```

### JSON format

Array of objects. `medusa_product_id`, `title`, and `description` are required.

```json
[
  {
    "medusa_product_id": "prod_01JXYZ",
    "title": "Trail Running Shoes",
    "description": "Lightweight shoes with a grippy outsole…",
    "category": "running",
    "tags": ["trail", "road", "lightweight"],
    "price_min": 89.99,
    "price_max": 129.99,
    "thumbnail_url": "https://example.com/img/trail-shoe.jpg"
  }
]
```

### CSV format

Header row required. Use `|` as the tag separator (e.g. `trail|road|lightweight`)
to avoid conflicts with the CSV comma delimiter.

```csv
medusa_product_id,title,description,category,tags,price_min,price_max,thumbnail_url
prod_01JXYZ,Trail Running Shoes,"Lightweight shoes, grippy outsole",running,trail|road,89.99,129.99,https://…
```

### Error handling

- **API failure** — retries up to 3 times with exponential backoff (1 s → 2 s → 4 s).
- **Duplicate products** — upserted (row updated), not skipped.
- **Validation errors** — caught upfront before any API call; the script exits with a clear message.
- **Partial failure** — the script continues to the next product and prints a summary at the end. Exit code 1 if any product failed.

## Image ingestion script — backfill image_embedding

`scripts/ingest-images.mjs` fills the `image_embedding` column (Feature 2). It's
an **images-only** pass: products must already exist in `product_embeddings`
from text ingestion — this never touches text embeddings.

For each existing row it looks up the product's image URL by **title** in the
seed CSV, downloads the image **from Supabase Storage directly**, embeds it with
`voyage-multimodal-3.5` at 512 dimensions (via the REST API — the installed
`voyageai` SDK can't request `output_dimension`), and `PATCH`es the row's
`image_embedding` by `medusa_product_id`.

```bash
# Dry run — downloads + embeds every image but writes nothing to Supabase
node --env-file=.env scripts/ingest-images.mjs --csv ../backend/scripts/data/products.csv --dry-run

# Live run — writes image_embedding to Supabase
node --env-file=.env scripts/ingest-images.mjs --csv ../backend/scripts/data/products.csv

# Override the rate limit (default 3 = Voyage free tier). Higher once the
# account has a payment method and standard limits.
node --env-file=.env scripts/ingest-images.mjs --csv … --rpm 60
```

Requires the `match_products_by_image` RPC in Supabase (`sql/match_products_by_image.sql`).

### Throttling & error handling

- **Rate limit** — the Voyage free tier (no payment method) allows only **3 requests/min**. The script paces requests to `--rpm` (default 3), so a 100-product backfill takes ~35 min. It prints an ETA at start.
- **Transient failures / 429s** — retried with exponential backoff (4 attempts, 5 s base) — longer than the text path because free-tier 429s clear slowly.
- **Missing image URL** — a product whose title isn't in the CSV is skipped (counted separately), not failed.
- **Partial failure** — continues to the next product; prints an OK / skipped / failed summary and a final `N/total` verification count. Exit code 1 if any product failed.
