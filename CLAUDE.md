# AI Shopping Assistant — Project Context for Claude Code

## Role & Focus
You are assisting in the development of an AI-powered shopping assistant built on top of a sportswear e-commerce platform. Your primary focus is:

- **RAG pipeline** — retrieval-augmented generation over a product catalog
- **Semantic search** — natural language queries converted to vector embeddings and matched against product embeddings via cosine similarity
- **Image-based search** — multimodal search using CLIP embeddings to find visually similar products
- **Business analytics dashboard** — insights for the store owner: most searched products, lost sales (queries with no results), and business intelligence from chat interactions

When suggesting code, architecture decisions, or debugging approaches, always consider how they affect these four core pillars. The AI assistant is the product — not a feature bolted on top.

---

## Project Overview

Sportswear e-commerce platform (similar to Adidas.com) with an AI-powered shopping assistant integrated directly into the storefront. Users describe what they need in natural language or upload a photo, and the system recommends products from the catalog with explanations.

Built as part of **Startup Experience 3.0** — MVP to be demoed to investors and recruiters via LinkedIn.

---

## Team

| Role | Responsibilities |
|------|-----------------|
| **Lead + Backend (Hector)** | Project coordination, RAG pipeline, LLM integration, embeddings, API design, semantic + image search |
| **Backend** | Medusa setup, product CRUD, ingestion service, Supabase schema |
| **Frontend** | Chat UI, product cards, image upload, dashboard, storefront customization |

---

## Repository Structure (Monorepo)

```
apps/                               → workspace packages (Turborepo + npm workspaces over apps/**)
├── backend/                        → Medusa.js backend + API routes
│   ├── src/
│   │   ├── api/                    → custom routes (chat, image search, dashboard)
│   │   ├── jobs/                   → ingestion cron job (triggers chatbot-core)
│   │   └── subscribers/            → Medusa event subscribers
│   ├── tests/                      → Jest integration tests
│   └── package.json
│
├── storefront/                     → Next.js 15.5 + React 19 Medusa storefront
│   └── src/                        → modules/, app/[countryCode]/(main|checkout), lib/, styles/
│                                     (conventions documented in apps/storefront/CLAUDE.md)
│
├── chatbot-core/                   → AI engine (RAG pipeline, search, analytics)
│   ├── src/
│   │   ├── config/
│   │   │   ├── ai.config.ts        → OpenAI + Voyage AI client instances
│   │   │   ├── supabase.config.ts  → Supabase client (pgvector + auth)
│   │   │   └── index.ts
│   │   │
│   │   ├── pipeline/               → RAG steps — each class has single responsibility
│   │   │   ├── QueryParser.ts      → extracts intent + structured filters
│   │   │   ├── EmbeddingService.ts → text embeddings via Voyage AI
│   │   │   ├── RetrievalService.ts → cosine search in pgvector
│   │   │   ├── PromptAssembler.ts  → builds prompt with context + history
│   │   │   ├── LLMService.ts       → OpenAI call, handles streaming
│   │   │   ├── ResponseFormatter.ts→ formats JSON + product cards
│   │   │   └── index.ts
│   │   │
│   │   ├── image/                  → Feature 2: image-based search
│   │   │   ├── ImageEmbeddingService.ts  → CLIP embeddings
│   │   │   ├── ImageRetrievalService.ts  → cosine search on image_embedding
│   │   │   └── index.ts
│   │   │
│   │   ├── orchestrator/           → coordinates full pipeline (no business logic)
│   │   │   ├── ChatOrchestrator.ts → Feature 1: conversational search
│   │   │   ├── ImageOrchestrator.ts→ Feature 2: image search
│   │   │   └── index.ts
│   │   │
│   │   ├── analytics/              → Feature 3: business analytics
│   │   │   ├── ChatLogger.ts       → writes to chat_logs (Supabase)
│   │   │   ├── AnalyticsService.ts → SQL aggregations for dashboard
│   │   │   └── index.ts
│   │   │
│   │   ├── ingestion/              → offline indexing pipeline
│   │   │   ├── ProductIngester.ts  → reads products from Medusa
│   │   │   ├── ChunkBuilder.ts     → builds rich text for embedding
│   │   │   ├── EmbeddingIndexer.ts → generates + upserts into pgvector
│   │   │   └── index.ts
│   │   │
│   │   ├── interfaces/             → contracts (Dependency Inversion — SOLID)
│   │   │   ├── IEmbeddingService.ts → embedding provider contract
│   │   │   ├── IRetrievalService.ts → vector store contract
│   │   │   ├── ILLMService.ts       → LLM provider contract
│   │   │   ├── IChatLogger.ts       → logging contract
│   │   │   └── index.ts
│   │   │
│   │   ├── types/                  → shared domain types
│   │   │   ├── product.types.ts    → Product, ProductVariant, ProductCard
│   │   │   ├── chat.types.ts       → ChatMessage, ChatSession, ChatResponse
│   │   │   ├── pipeline.types.ts   → ParsedQuery, RetrievalResult, PromptContext
│   │   │   ├── analytics.types.ts  → ChatLog, AnalyticsMetric, DashboardData
│   │   │   └── index.ts
│   │   │
│   │   ├── errors/                 → centralized error handling
│   │   │   ├── ChatbotError.ts     → base error class
│   │   │   ├── EmbeddingError.ts
│   │   │   ├── RetrievalError.ts
│   │   │   └── index.ts
│   │   │
│   │   └── utils/
│   │       ├── formatProducts.ts   → formats products for prompt
│   │       ├── scoreFilter.ts      → applies similarity threshold (0.60)
│   │       └── index.ts
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── pipeline/
│   │   │   │   ├── QueryParser.test.ts
│   │   │   │   ├── EmbeddingService.test.ts
│   │   │   │   ├── RetrievalService.test.ts
│   │   │   │   ├── PromptAssembler.test.ts
│   │   │   │   └── ResponseFormatter.test.ts
│   │   │   ├── image/
│   │   │   │   └── ImageEmbeddingService.test.ts
│   │   │   └── analytics/
│   │   │       └── AnalyticsService.test.ts
│   │   ├── integration/
│   │   │   ├── ChatOrchestrator.test.ts
│   │   │   └── ImageOrchestrator.test.ts
│   │   └── mocks/
│   │       ├── openai.mock.ts
│   │       ├── voyageai.mock.ts
│   │       └── supabase.mock.ts
│   │
│   ├── .env.example
│   ├── jest.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── design/                         → VECTRA reference design — static HTML/CSS/JS via Vite.
                                      Visual source of truth the storefront is matched against.
```

Repo root holds `turbo.json` and the workspace `package.json`; all packages live under `apps/`.
Each app deploys independently on Vercel — one project per folder, same repo.
`chatbot-core` is consumed by `backend` as a local workspace package — not deployed separately.
`design/` is a static reference mockup — not deployed.

### SOLID Principles Applied in chatbot-core

- **Single Responsibility** — each class has one job: `QueryParser` only parses, `EmbeddingService` only embeds, `RetrievalService` only searches. `ChatOrchestrator` coordinates but never implements a step.
- **Open/Closed** — swapping Voyage AI for another provider means creating a new class implementing `IEmbeddingService` — zero changes to existing code.
- **Liskov Substitution** — any `IEmbeddingService` implementation is interchangeable. The orchestrator never knows which provider it's using.
- **Interface Segregation** — `IEmbeddingService`, `IRetrievalService`, `ILLMService` are small and specific — not one giant "AI service" interface.
- **Dependency Inversion** — `ChatOrchestrator` depends on interfaces, not concrete implementations. Implementations are injected from outside.

---

## Tech Stack

### Frontend
- **Next.js 15.5** (App Router, Turbopack, dev on port 8000) — Medusa Storefront starter
- **React 19 + TypeScript**
- **Medusa.js** — headless e-commerce storefront (catalog, cart, checkout)
- **Jest** — unit testing

### Backend
- **Medusa.js** — e-commerce backend (products, variants, orders, admin)
- **Node.js + TypeScript**
- **Custom Express routes** inside Medusa — RAG pipeline API endpoints
- **Supabase** — PostgreSQL + pgvector (vector search) + Auth
- **Jest** — unit testing

### AI & Embeddings
- **Voyage AI** (`voyage-3`, 1024 dimensions) — text embeddings for semantic search — free tier
- **OpenAI API** (`gpt-4o-mini`) — LLM for chat responses and query parsing
- **CLIP** — image embeddings (512 dimensions) for image-based search

### Infrastructure
- **GitHub Projects** — task management (issues, kanban, PRs)
- **Vercel** — independent deployments per subfolder from monorepo
- **Supabase** — hosted Postgres + pgvector + Auth

---

## Architecture

### Core Architectural Decisions
1. **Medusa/Postgres is the source of truth** for the product catalog — products, variants, orders, inventory
2. **Supabase/pgvector is the search intelligence layer** — embeddings, vector search, chat logs. These are intentionally separated — swapping either system does not affect the other
3. **No LangChain** — RAG pipeline implemented from scratch in Node.js for full control, transparency, and senior-level signal
4. **Supabase Auth** handles all authentication (email + Google OAuth) — no custom JWT implementation
5. **Monorepo** — backend and storefront in same repo, deployed independently on Vercel

### System Flow

```
Client (Next.js Storefront)
        ↓
Supabase Auth → JWT issued (email or Google OAuth)
        ↓
API Gateway (Medusa custom routes — validates Supabase JWT)
        ↓
RAG Pipeline:
  1. Query parser    → extract intent + structured filters (category, price, size)
  2. Embedding svc   → Voyage AI text-embed (semantic) or CLIP (image-based)
  3. Retrieval       → pgvector cosine similarity search (text + image hybrid)
  4. Prompt assembly → top-k products + user query + conversation history
  5. LLM call        → OpenAI gpt-4o-mini generates response
  6. Response fmt    → JSON + structured product cards + similarity scores
        ↓
Data Layer:
  - Medusa Postgres   → products, variants, orders
  - Supabase Auth     → users, sessions (email + Google OAuth)
  - Supabase pgvector → product_embeddings, chat_logs
```

### Ingestion Pipeline (offline)
```
Medusa product (new/updated)
        ↓
Ingestion service (cron job, runs hourly)
        ↓
Build embedding text: title + description + tags + category
        ↓
Voyage AI  → text embedding (1024d)
CLIP       → image embedding (512d)
        ↓
Upsert into product_embeddings (Supabase)
```

---

## Database Schema

### Supabase — product_embeddings
```sql
CREATE TABLE product_embeddings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medusa_product_id TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  category          TEXT,
  tags              TEXT[],
  price_min         NUMERIC,
  price_max         NUMERIC,
  thumbnail_url     TEXT,
  embedding         vector(1024),  -- Voyage AI text embedding
  image_embedding   vector(512),   -- CLIP image embedding
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON product_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON product_embeddings USING ivfflat (image_embedding vector_cosine_ops);
```

### Supabase — chat_logs (Business Analytics)
```sql
CREATE TABLE chat_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id),  -- Supabase Auth
  session_id     TEXT NOT NULL,
  user_query     TEXT NOT NULL,
  retrieved_ids  TEXT[],      -- medusa_product_ids returned
  top_score      NUMERIC,     -- best cosine similarity score
  has_results    BOOLEAN,     -- false = lost sale / catalog gap
  category_hint  TEXT,        -- inferred category from query
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security: users see only their own logs
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own logs" ON chat_logs
  FOR SELECT USING (auth.uid() = user_id);
```

### Medusa — Product structure (built-in)
```
Product
├── title, description, category, tags, thumbnail
└── ProductVariant[]
    ├── title (e.g. "Size 42 · Black")
    ├── sku, price, inventory
    └── options: { size, color }
```

### Supabase Auth — User management
- Email + password registration
- Google OAuth provider
- JWT issued automatically on login — validated by Medusa custom routes via Supabase SDK
- `auth.users` table managed entirely by Supabase

---

## Features

### Feature 1 — Conversational Search / Semantic Search (Core)
Natural language query → query parser extracts intent + filters → Voyage AI text embedding → pgvector cosine similarity search → top-5 products as context → OpenAI gpt-4o-mini generates ranked response with explanations.

**Key implementation notes:**
- Query parsing happens BEFORE embedding — extract `category`, `price_max`, `size` as structured filters, apply as SQL `WHERE` clauses before vector search
- Similarity threshold: if `top_score < 0.60` → mark `has_results = false` in chat_logs → return graceful "no exact match" response
- Top-k = 5: pass all 5 to LLM, let LLM rank and explain tradeoffs
- Log every interaction to `chat_logs` for analytics

### Feature 2 — Image-Based Search (Wow factor)
User uploads photo → CLIP generates image embedding (512d) → cosine search against `image_embedding` column → hybrid retrieval: image results + text results merged → top-k passed to OpenAI for response.

**Key implementation notes:**
- Text search and image search run in PARALLEL — merge results before LLM call (hybrid retrieval pattern)
- Image upload handled via multipart form in the storefront
- CLIP runs as a separate service or via Replicate API to avoid heavy ML dependencies in Node.js

### Feature 3 — Business Analytics Dashboard (Business impact)
Panel for the store owner powered entirely by `chat_logs` queries:

- **Most searched products** — products appearing most in `retrieved_ids`
- **Lost sales** — queries where `has_results = false` → catalog gaps the owner should fill
- **Category intent** — which categories generate multi-turn conversations (high purchase intent)
- **Search trends** — query volume over time

**Key implementation notes:**
- All analytics are SQL aggregations on `chat_logs` — no separate analytics service needed for MVP
- Dashboard is read-only for the store owner — protected route in storefront
- Store owner identified by a specific role in Supabase Auth metadata

---

## RAG Pipeline — Implementation Notes

- **Embedding model consistency** — use `voyage-3` for BOTH indexing and querying. Never mix embedding models
- **Query parsing before embedding** — structured filters applied as SQL `WHERE` before vector search significantly improves precision
- **Similarity threshold at 0.60** — below this the query is a lost sale, logged accordingly
- **Top-k = 5** — retrieve 5 products, pass all to LLM, let LLM reason over them
- **Conversation history** — include last 3 turns in prompt assembly for context continuity
- **No LangChain** — every step is explicit Node.js code — easier to debug, easier to explain in interviews and pitch

---

## Testing Strategy (Jest)

```
chatbot-core/tests/
├── unit/
│   ├── pipeline/
│   │   ├── QueryParser.test.ts       → intent extraction, filter parsing
│   │   ├── EmbeddingService.test.ts  → Voyage AI integration (mocked)
│   │   ├── RetrievalService.test.ts  → pgvector query logic (mocked Supabase)
│   │   ├── PromptAssembler.test.ts   → prompt construction with context
│   │   └── ResponseFormatter.test.ts → JSON output structure
│   ├── image/
│   │   └── ImageEmbeddingService.test.ts
│   └── analytics/
│       └── AnalyticsService.test.ts
├── integration/
│   ├── ChatOrchestrator.test.ts      → RAG end-to-end (mocked LLM)
│   └── ImageOrchestrator.test.ts     → image search end-to-end
└── mocks/
    ├── openai.mock.ts
    ├── voyageai.mock.ts
    └── supabase.mock.ts

storefront/tests/
└── unit/
    ├── ChatUI.test.tsx               → message rendering, input handling
    └── ProductCard.test.tsx          → product display, match score badge
```

Focus unit tests on `chatbot-core/pipeline/` — these are the most critical and most likely to fail silently. Mock all external services (OpenAI, Voyage AI, Supabase) in unit tests; use real clients only in integration tests with a test Supabase project.

---

## Product Catalog

- **80–100 real sportswear products** — curated from Kaggle fashion datasets filtered to sportswear + manual curation from LATAM stores
- **Enriched descriptions** — generated via OpenAI/Gemini Flash from short product metadata (150+ words each, rich with activity type, material, conditions, target user)
- **Categories** — running shoes, trail shoes, training apparel, jackets, accessories
- **Required fields** — title, long description, category, tags, price, size options, color options, image URL
- **Seed process** — CSV → Node.js seed script → Medusa Admin API → triggers ingestion service → embeddings in pgvector

---

## Development Timeline (8 weeks)

| Weeks | Focus |
|-------|-------|
| 1–2 | Monorepo setup, Medusa backend + storefront, Supabase schema, seed data, API contract |
| 3 | Ingestion pipeline, Voyage AI text embeddings, pgvector indexed |
| 4–5 | Feature 1 — Semantic search RAG pipeline end to end + Jest unit tests |
| 6 | Feature 3 — Business analytics dashboard (chat_logs + SQL aggregations) |
| 7–8 | Feature 2 — Image search (CLIP hybrid retrieval) + full integration + demo prep |

---

## GitHub Workflow

- Issues as tasks (one issue per feature/subtask)
- Feature branches: `feature/rag-pipeline`, `feature/image-search`, `feature/dashboard`, etc.
- Pull requests with review before merging to `main`
- GitHub Projects kanban: Backlog → In Progress → Review → Done
- Vercel deploy preview per PR (storefront + backend independently)

---

## Key Decisions Log

1. **Monorepo** — backend and storefront in same repo (recommended by Medusa community), deployed independently on Vercel per subfolder
2. **Medusa as catalog source of truth** — products, variants, orders live in Medusa/Postgres; Supabase is search-only
3. **Supabase Auth** — email + Google OAuth out of the box; JWT validated via Supabase SDK; RLS on chat_logs
4. **No LangChain** — RAG implemented from scratch in Node.js for full control and transparency
5. **Voyage AI for text embeddings** — free tier, high quality, purpose-built for retrieval
6. **OpenAI gpt-4o-mini as LLM** — cost-effective, strong reasoning, reliable function calling for query parsing
7. **CLIP for image embeddings** — enables multimodal search without training a custom model
8. **Query parsing before embedding** — structured filters (price, category, size) applied as SQL WHERE before vector search
9. **Hybrid retrieval for image search** — text and image searches run in parallel, merged before LLM call
10. **Similarity threshold at 0.60** — below this = lost sale, logged in chat_logs, surfaced in dashboard
11. **Ingestion as separate cron job** — decoupled from main API, runs hourly, never blocks real-time queries
12. **Jest for unit testing** — focus on RAG pipeline components (query parser, embedding service, retrieval, prompt assembly)