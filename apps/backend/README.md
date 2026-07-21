<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
    <a href="https://www.producthunt.com/posts/medusa"><img src="https://img.shields.io/badge/Product%20Hunt-%231%20Product%20of%20the%20Day-%23DA552E" alt="Product Hunt"></a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

## Compatibility

This starter is compatible with versions >= 2 of `@medusajs/medusa`. 

## Custom API Routes

### POST /store/chat/image-search

Image-based product search (optionally combined with a text query) via
`@dtc/chatbot-core`'s `ImageOrchestrator`. See `apps/chatbot-core/README.md`
→ "Image Search Architecture" for the full design.

**Auth:** No customer authentication required (Medusa's built-in customer
auth on `/store/*` is configured with `allowUnauthenticated: true`). Like
every route under `/store`, it still requires Medusa's standard
`x-publishable-api-key` header — a request missing it is rejected before this
route's own code ever runs, with Medusa's own `{ code, type, message }` error
shape rather than this endpoint's `{ message }` convention. Unlike
`/search/chat` and `/search/semantic` (which deliberately live outside
`/store` and skip this requirement), callers of this endpoint must attach the
key.

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | yes | `image/jpeg`, `image/png`, or `image/webp`; max 5MB |
| `sessionId` | text | yes | Non-empty string |
| `query` | text | no | Optional text refinement, enables hybrid image+text retrieval |

**Response:** `200` — a `ChatResponse` (see `@dtc/chatbot-core`'s
`types/chat.types.ts`): `{ message, products, hasResults,
similarityThresholdMet, appliedFilters? }` (`history` is omitted for this
route — image search is single-turn only).

| Status | Cause |
|---|---|
| 400 | No `image` file attached, `sessionId` missing/empty, `query` provided but empty, unsupported image type |
| 413 | Image exceeds 5MB |
| 500 | `ImageOrchestrator` pipeline failure (embedding/retrieval/LLM) — deliberately 500, not the 502 used by `/search/chat`/`/search/semantic` |

## Getting Started

Visit the [Quickstart Guide](https://docs.medusajs.com/learn/installation) to set up a server.

Visit the [Docs](https://docs.medusajs.com/learn/installation#get-started) to learn more about our system requirements.

## What is Medusa

Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about [Medusa’s architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the Docs.

## Community & Contributions

The community and core team are available in [GitHub Discussions](https://github.com/medusajs/medusa/discussions), where you can ask for support, discuss roadmap, and share ideas.

Join our [Discord server](https://discord.com/invite/medusajs) to meet other community members.

## Other channels

- [GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Twitter](https://twitter.com/medusajs)
- [LinkedIn](https://www.linkedin.com/company/medusajs)
- [Medusa Blog](https://medusajs.com/blog/)
