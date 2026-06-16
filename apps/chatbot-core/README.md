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

`EmbeddingService`, `RetrievalService`, `LLMService`, `ImageEmbeddingService`, `ImageRetrievalService`, `ChatLogger`, `AnalyticsService`, `ProductIngester`, and `EmbeddingIndexer` are currently placeholders that throw `"<provider> not configured yet"` — they need their real SDK clients (OpenAI, Voyage AI, Supabase) wired up in `config/`. `QueryParser`, `PromptAssembler`, `ResponseFormatter`, and `ChunkBuilder` are pure logic and already implemented.

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
