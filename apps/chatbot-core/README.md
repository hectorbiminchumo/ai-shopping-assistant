# chatbot-core

AI engine for the shopping assistant: RAG pipeline (semantic search), image-based search, and business analytics aggregations.

**This is a library, not a standalone server.** It's consumed by `apps/backend` as a local npm workspace package (`@dtc/chatbot-core`) and mounted behind Medusa's custom Express routes — it is not deployed separately and has no `app.listen`.

## Folder structure

```
src/
  config/         # Env vars + client setup (OpenAI, Voyage AI, Supabase)
  pipeline/       # RAG steps — each class has a single responsibility
    QueryParser, EmbeddingService, RetrievalService,
    PromptAssembler, LLMService, ResponseFormatter
  image/          # Feature 2: image-based search (CLIP embeddings)
  orchestrator/   # Coordinates the pipeline end to end — no business logic of its own
    ChatOrchestrator (text), ImageOrchestrator (image, hybrid retrieval)
  analytics/      # Feature 3: ChatLogger + AnalyticsService for the dashboard
  ingestion/       # Offline indexing: reads Medusa products, builds embeddings, upserts to pgvector
  interfaces/     # Contracts (IEmbeddingService, IRetrievalService, ILLMService, IChatLogger)
                   # — providers are injected, never hardcoded (Dependency Inversion)
  errors/         # ChatbotError and subclasses
  utils/          # formatProducts, scoreFilter (similarity threshold = 0.60)
  index.ts        # Public package entry point
tests/
  unit/           # Per-class tests, mirrors src/
  integration/    # ChatOrchestrator / ImageOrchestrator with mocked providers
  mocks/          # openai.mock.ts, voyageai.mock.ts, supabase.mock.ts
```

`LLMService`, `ImageEmbeddingService`, `ImageRetrievalService`, and `ProductIngester` are still placeholders. `EmbeddingService`, `RetrievalService`, `EmbeddingIndexer`, `ChatLogger`, and `AnalyticsService` are fully implemented. `QueryParser`, `PromptAssembler`, `ResponseFormatter`, and `ChunkBuilder` are pure logic.

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
