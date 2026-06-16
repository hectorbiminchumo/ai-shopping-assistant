# AI Shopping Assistant — Frontend

## Project overview
Next.js frontend for an AI-powered shopping assistant. Provides a conversational search UI,
image-based product search, and a business insights dashboard for a sportswear e-commerce platform.

## Tech stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Language:** TypeScript (strict mode)
- **Testing:** Jest
- **CI:** GitHub Actions

## Folder structure
```
app/
  (chat)/       # Conversational search page
  (image)/      # Image-based search page
  (dashboard)/  # Business insights dashboard page
components/
  chat/         # Chat input, message list, message bubble
  products/     # Product card, product grid, filters
  image/        # Image upload, drag & drop, results grid
  dashboard/    # Charts, summary cards, tables
  ui/           # Shared UI primitives (button, input, skeleton)
lib/
  api.ts        # Backend API client
  utils.ts      # Shared utility functions
hooks/          # Custom React hooks
```

## Environment variables
Copy `.env.example` to `.env.local` before running locally.
Never commit `.env.local` or any real credentials.
Required variables:
- `NEXT_PUBLIC_API_URL` — backend base URL
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Commands
```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run test      # Run Jest unit tests
npm run lint      # Run ESLint
```

## Code conventions
- All files in TypeScript — no plain `.js` files
- Use the App Router — no `pages/` directory
- Keep components small and focused — one responsibility per component
- No business logic inside components — delegate to custom hooks or `lib/`
- Use Tailwind utility classes only — no custom CSS files
- No external UI component libraries — build from primitives

## Testing conventions
- Every component must have a corresponding unit test
- Test files live next to the component: `ProductCard.tsx` → `ProductCard.test.tsx`
- Use Jest + React Testing Library for component tests
- Test user interactions, not implementation details
- Run `npm run test` before opening a PR

## Git workflow
- Branch naming: `feature/`, `fix/`, `chore/` prefixes (e.g. `feature/chat-ui`)
- Every change goes through a PR — no direct pushes to `main`
- PRs require 2 approvals + passing CI before merge
- Reference the GitHub Issue in the PR description (e.g. `closes #12`)

## When using Claude Code
- Always specify which component or hook you are working on
- When generating a new component, ask Claude to generate the unit test in the same response
- For code reviews, ask Claude to check: prop types, accessibility, and test coverage
- Keep Tailwind class lists readable — ask Claude to group by category (layout, spacing, color)
- Do not ask Claude to generate environment variable values or real API keys
