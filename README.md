# AI Shopping Assistant

An online store whose core feature is an **AI-powered shopping assistant**. On top of a
standard e-commerce experience (catalog, cart, checkout), the project adds a conversational
assistant that helps shoppers find products, compare options, and get personalized
recommendations through natural language and image-based search.

## Tech Stack

- **Monorepo:** [Turborepo](https://turbo.build/) + npm workspaces
- **Backend:** [Medusa v2](https://medusajs.com/) (headless e-commerce, TypeScript)
- **Storefront:** [Next.js 15](https://nextjs.org/) (App Router) + Tailwind CSS + TypeScript
- **Design:** Static design system / prototypes built with [Vite](https://vitejs.dev/)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL + pgvector)
- **AI Engine:** OpenAI `gpt-4o-mini` (LLM) · Voyage AI `voyage-3` (text embeddings) · Voyage AI `voyage-multimodal-3` (image embeddings, 512d)

## Project Structure

```
store/
├── apps/
│   ├── backend/        # Medusa v2 e-commerce backend (@dtc/backend)
│   │                   #   - Products, orders, cart, checkout, admin dashboard
│   │                   #   - Custom API routes, modules, workflows, jobs
│   ├── storefront/     # Next.js storefront (@dtc/storefront)
│   │                   #   - Customer-facing store + AI shopping assistant UI
│   ├── design/         # Design system & static prototypes (forma-design, Vite)
│   └── chatbot-core/   # AI engine library (@dtc/chatbot-core) — not a server,
│       │               #   consumed by apps/backend as a local workspace package
│       ├── src/
│       │   ├── config/       # Env vars + client setup (OpenAI, Voyage AI, Supabase)
│       │   ├── pipeline/     # RAG steps (QueryParser → Embedding → Retrieval →
│       │   │                 #   PromptAssembler → LLM → ResponseFormatter)
│       │   ├── image/        # Image-based search (voyage-multimodal-3 embeddings)
│       │   ├── orchestrator/ # ChatOrchestrator, ImageOrchestrator (DI, no business logic)
│       │   ├── analytics/    # ChatLogger + AnalyticsService (dashboard data)
│       │   ├── ingestion/    # Offline indexing pipeline (Medusa → pgvector)
│       │   ├── interfaces/   # IEmbeddingService, IRetrievalService, ILLMService, IChatLogger
│       │   ├── errors/       # ChatbotError and subclasses
│       │   ├── types/        # Shared domain types (Product, ChatMessage, ParsedQuery…)
│       │   └── utils/        # formatProducts, scoreFilter (threshold 0.60)
│       └── tests/
│           ├── unit/         # Per-class tests (pipeline, image, analytics)
│           ├── integration/  # ChatOrchestrator, ImageOrchestrator (mocked providers)
│           └── mocks/        # openai.mock.ts, voyageai.mock.ts, supabase.mock.ts
├── turbo.json          # Turborepo task pipeline
├── package.json        # Workspace root (scripts, workspaces config)
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 11
- A [Supabase](https://supabase.com/) project (PostgreSQL connection string)

## Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd store
   ```

2. **Install dependencies** (installs all workspaces from the root)

   ```bash
   npm install
   ```

3. **Configure environment variables**

   - **Backend** (`apps/backend`): copy the template and fill in the values.

     ```bash
     cp apps/backend/.env.template apps/backend/.env
     ```

     Set `DATABASE_URL` to your Supabase PostgreSQL connection string.

   - **Storefront** (`apps/storefront`): create `.env.local` with at least:

     ```bash
     NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
     NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<your-publishable-key>
     NEXT_PUBLIC_DEFAULT_REGION=dk
     NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
     ```

     The publishable key must exist in the Medusa backend database. Get it from the Medusa Admin
     (`http://localhost:9000/app` → Settings → API Key Management). If you reset the database,
     you need a new key — the old one will no longer be valid.

   - **AI Engine** (`apps/chatbot-core`): copy the example and fill in your API keys.

     ```bash
     cp apps/chatbot-core/.env.example apps/chatbot-core/.env
     ```

     Required variables: `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MEDUSA_BACKEND_URL`.

4. **Run database migrations and seed data**

   ```bash
   npm run backend:seed
   ```

5. **Start the development servers**

   ```bash
   # Everything at once
   npm run dev

   # Or run a single app
   npm run backend:dev      # Medusa backend     -> http://localhost:9000
   npm run storefront:dev   # Next.js storefront -> http://localhost:8000
   npm run design:dev       # Vite design system
   ```

   `chatbot-core` is a library — it does not run as a standalone server. Run its tests with:

   ```bash
   cd apps/chatbot-core && npm test
   ```

## Available Scripts

Run from the repository root:

| Script                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | Start all apps in development mode           |
| `npm run build`           | Build all apps                               |
| `npm run start`           | Start all apps in production mode            |
| `npm run lint`            | Lint all apps                                |
| `npm run test`            | Run tests across all apps                    |
| `npm run backend:dev`     | Start only the Medusa backend                |
| `npm run backend:seed`    | Seed the backend database                    |
| `npm run storefront:dev`  | Start only the Next.js storefront            |
| `npm run design:dev`      | Start only the design system                 |
| `cd apps/chatbot-core && npm test`  | Run chatbot-core unit + integration tests |
| `cd apps/chatbot-core && npm run build` | Compile chatbot-core to `dist/`       |

## Troubleshooting

### Storefront throws `Backend returned 400` on startup

The storefront middleware fetches `/store/regions` on every request. Medusa returns 400 when the
publishable key in `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` does not exist in the backend database.

**Steps to fix:**

1. Make sure the Medusa backend is running: `npm run backend:dev`
2. Open the Medusa Admin at `http://localhost:9000/app` and log in
3. Go to **Settings → API Key Management**
4. Copy an existing publishable key, or create a new one if none exist
5. Set that value as `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env.local`
6. Restart the storefront dev server (Next.js does not reload env files automatically)

To verify the key works before restarting the storefront:

```bash
curl http://localhost:9000/store/regions \
  -H "x-publishable-api-key: <your-key>"
```

A valid key returns `200` with a list of regions. A 400 response means the key is wrong or missing.

> This issue commonly occurs after resetting or re-seeding the backend database, because the
> database-level key is wiped while `.env.local` still holds the old value.

## Team

- Hector
- Agustin
- Ismael

## License

See [LICENSE](./LICENSE).
