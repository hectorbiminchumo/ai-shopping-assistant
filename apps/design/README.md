# FORMA — Athletic Store Design

A production-ready frontend design for a minimalist athletic e-commerce store. Built with vanilla HTML, CSS custom properties, and a single dependency-free JavaScript module. No framework, no build step required for the design layer.

## Overview

FORMA is a monochrome, high-performance storefront UI with full light/dark theme support, a responsive layout system, and a fluid type scale. The design prioritizes clarity and speed — both in visual hierarchy and in how shoppers find what they need.

### SofIA — AI Shopping Assistant

The standout feature is **SofIA**, a conversational shopping assistant embedded in a full-screen panel accessible from any page. SofIA allows shoppers to:

- **Search by description** — type a natural-language query ("trail running shoes for wet terrain") and receive matched catalog results instantly
- **Search by image** — paste or upload a product photo and SofIA identifies visually similar items from the catalog
- **Browse via suggestion pills** — pre-built query shortcuts for common intents (long-distance running, waterproof outdoor, etc.)

When a Claude API integration is available via `window.claude.complete`, SofIA sends queries to the model and parses a structured JSON response with product IDs and a reply message. Without it, it falls back to local keyword matching against the catalog.

---

## File Reference

| File | Description |
|---|---|
| `index.html` | Store homepage — hero slider, category grid, featured product rail, lookbook, banner, newsletter, footer |
| `product.html` | Product detail page (PDP) — image gallery, size selector, stock alerts, accordion, add-to-cart |
| `styles.css` | Complete design system stylesheet — CSS custom properties (tokens), all component styles, responsive breakpoints |
| `app.js` | Shared JavaScript module — theme toggle, SofIA chat panel, hero slider, rail navigation, PDP logic, cart state, Claude API integration |
| `image-slot.js` | Custom element `<image-slot>` — drag-and-drop image placeholder with persistence, reframe/crop mode, and WebP output |
| `documentation.html` | Full design system documentation — tokens, components, patterns, behavior specs, and accessibility notes |
| `vite.config.js` | Vite configuration for local development server |

---

## Design System

The complete design system is documented at **`documentation.html`**, covering:

- **Tokens** — color palette (light + dark), typography scale, spacing, border radius, shadows, easing
- **Components** — buttons, badges, alerts, form inputs, checkboxes, validation states, accordion, cards
- **Page sections** — hero variants, search panel, category tiles, product rails, banner, newsletter, footer
- **Behavior** — JavaScript subsystems, `<image-slot>` attributes and persistence, accessibility practices

All design tokens are CSS custom properties on `:root` (light) and `html.dark` (dark). Switching themes is a single class toggle — no JavaScript re-renders.

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:7000` to view the store. The design system documentation is at `http://localhost:7000/documentation.html`.

---

## Key Design Decisions

- **Zero web fonts** — the type stack uses native system fonts (`Helvetica Neue`, `ui-monospace`) for instant rendering at any connection speed
- **Single easing curve** — `cubic-bezier(.22,.61,.36,1)` governs every transition, producing a consistent deceleration feel
- **Token-driven theming** — every color, shadow, and spacing value is a CSS variable; dark mode requires no component-level overrides
- **`<image-slot>` custom element** — placeholder slots accept drag-and-drop images and persist them to `.image-slots.state.json`, enabling content editing without a CMS
