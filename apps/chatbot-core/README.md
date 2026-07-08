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
  image/          # Feature 2: image-based search (CLIP embeddings)
  orchestrator/   # Coordinates the pipeline end to end — no business logic of its own
    ChatOrchestrator (text), ImageOrchestrator (image, hybrid retrieval)
  analytics/      # Feature 3: ChatLogger + AnalyticsService for the dashboard
  ingestion/       # Offline indexing: reads Medusa products, builds embeddings, upserts to pgvector
  interfaces/     # Contracts (IEmbeddingService, IRetrievalService, ILLMService, IChatLogger)
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
score = 0.60 × similarity + 0.25 × priceScore + 0.15 × categoryScore
```

| Signal | Weight | Description |
|--------|--------|-------------|
| `similarity` | 0.60 | Raw Voyage AI cosine similarity from pgvector |
| `priceScore` | 0.25 | `1 - price / priceMax`; neutral (0.5) when no budget is set or product has no price |
| `categoryScore` | 0.15 | 1.0 if product category matches parsed query category, 0.0 otherwise; neutral (0.5) when query has no category |

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
