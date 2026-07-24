# Storefront — Project Context for Claude Code

Next.js storefront for the AI Shopping Assistant, built on the **Medusa V2 Next.js starter** and reskinned as **VECTRA** (essential sportswear). This file documents how this app actually works so changes stay consistent.

## Stack

- **Next.js 15.5** (App Router, `--turbopack`) + **React 19** + **TypeScript** (`strict: true`)
- **Medusa V2** JS SDK (`@medusajs/js-sdk`) — catalog, cart, checkout
- **Tailwind CSS** + `@medusajs/ui-preset` + **design tokens as CSS variables** (`src/styles/globals.css`)
- **Headless UI** (`@headlessui/react`) for menus/popovers, **Stripe** for payments
- **Jest** (`next/jest`) + Testing Library for unit tests

## Layout & conventions

```
src/
├── app/[countryCode]/        → App Router, locale-prefixed routes
│   ├── (main)/               → storefront pages (Nav + Footer + Ask Vectra)
│   └── (checkout)/           → checkout flow (its own minimal layout, no chat)
├── modules/                  → feature folders: home, products, cart, checkout,
│                               layout, account, order, collections, categories,
│                               common, store, shipping, skeletons
├── lib/                      → data fetching (lib/data/*) + utils (lib/util/*)
├── styles/globals.css        → design tokens (CSS vars) + base styles
├── types/  middleware.ts
```

- **Path aliases:** `@modules/*` → `src/modules/*`, `@lib/*` → `src/lib/*`. Use them, not relative `../../..`.
- **Dev server runs on port 8000** (`npm run dev`). Build: `npm run build`. Bundle analysis: `npm run analyze`.
- **Route groups decide global UI.** Anything that must appear on every storefront page (but not checkout) goes in `(main)/layout.tsx`; `(checkout)` is a separate group with no Nav/Footer/chat.

## Hard rules (learned the hard way)

- **Prices: never divide `calculated_amount` by 100.** Medusa V2 amounts are already in major units. Format with `convertToLocale` (`@lib/util/money`) or `getProductPrice` (`@lib/util/get-product-price`) — never a hand-rolled `Intl.NumberFormat` with `/100`.
- **Internal links must carry the `countryCode`.** Use `LocalizedClientLink` (or `useParams().countryCode`) for navigation. Never a bare `<a href="/products/...">` or `window.location.href = "/products/..."` — it drops the locale prefix and breaks the region middleware.
- **TypeScript errors fail the build** (`next.config.js → typescript.ignoreBuildErrors: false`). Run `npx tsc --noEmit` before declaring work done; keep it at 0 errors.
- **ESLint is disabled during builds on purpose.** `next lint` currently crashes here (ajv `defaultMeta` error) and is deprecated in Next 16. Don't flip `eslint.ignoreDuringBuilds` back on until the config is migrated to the ESLint CLI.
- **Commit messages in English**, even when the conversation is in Spanish.

## Styling

- Design tokens live as CSS variables in `src/styles/globals.css` (`--text`, `--surface`, `--accent`, `--mono`, `--clr-danger`, …). Reference them via `var(--…)` so light/dark and brand changes stay centralized.
- The VECTRA components currently mix Tailwind classes, `style={{}}` inline styles, and a few injected `<style>` blocks. Match the surrounding file's approach when editing; prefer CSS variables + Tailwind over new inline styles for anything reusable.
- Header icons follow `apps/design/index.html` (the reference design). Keep SVG paths/stroke widths in sync with it.

## Ask Vectra (chat assistant)

- `VectraChat` (`modules/home/components/vectra-chat/`) is the floating assistant. It is mounted globally via the **`AskVectra` server loader** in `(main)/layout.tsx`, so it shows on every page **except checkout**.
- `AskVectra` fetches the catalog (`listProducts`) + region and passes the full `StoreProduct[]` to the UI.
- **Text search is wired to the real backend** — `send()` calls `search()` from `@lib/api`, which POSTs to `/search/semantic` on the Medusa backend (`NEXT_PUBLIC_API_URL`, default `http://localhost:9000`). Results are joined against the loader's catalog list by `medusaProductId` to recover the full Medusa product; results not in the catalog are dropped.
- **Image search is wired too.** Attaching a file (drag & drop, paste, or the attach button) *stages* it as a thumbnail in the composer — nothing is searched until send, so the user can attach a photo and then describe what they want about it. On send, `searchImage()` POSTs multipart to `/store/chat/image-search` with the composer text as the optional `query`, which makes the backend run hybrid retrieval (`0.6·image + 0.4·text`) instead of a purely visual search. That route sits under `/store`, so unlike `/search/*` it **requires the `x-publishable-api-key` header**.
- **Results render with the shared `ProductCard`** (`compact` mode) — the same card as the category/store grids.
- **Mini mode** — when the route changes while the panel is open (product card click, quick-add redirect), the chat docks to a corner widget on desktop (closes on mobile) so the new page stays visible. The header has minimize/maximize buttons; conversation and composer text persist across pages.

## Testing

- Jest is configured via `next/jest` (`jest.config.js`), which resolves the `@modules`/`@lib` aliases and runs the SWC transform. Setup: `jest.setup.js` (jest-dom).
- Tests live in `__tests__/` next to the code, named `*.test.ts(x)`. They are **excluded from `tsconfig.json`** so they don't affect the production type-check; Jest transpiles them itself.
- Run with `npm test` (needs `npm install` first to pull the test devDeps). Existing tests cover `convertToLocale` (price formatting) and `ProductCard`.

## Environment

Required: `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (enforced by `check-env-variables.js`). Also used: `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_API_URL` (AI search endpoints, defaults to `http://localhost:9000`), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY`. Local config in `.env.local`.
