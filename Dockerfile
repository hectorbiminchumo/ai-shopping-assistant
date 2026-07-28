# syntax=docker/dockerfile:1
#
# Medusa backend (@dtc/backend) for Railway.
#
# Built from the monorepo root on purpose. @dtc/backend depends on the
# workspace package @dtc/chatbot-core, which is not published to npm — the
# npm workspace symlink at <root>/node_modules/@dtc/chatbot-core is what makes
# it resolvable, so the root node_modules has to travel with the app.
#
# This is also why the documented Medusa deploy flow (`cd .medusa/server &&
# npm install`) is NOT used here: `medusa build` copies apps/backend's
# package.json verbatim into .medusa/server, workspace dependency and all, so
# that install would try to fetch @dtc/chatbot-core@^0.0.1 from the registry
# and fail with a 404. Instead the compiled server runs in place and Node
# resolves @dtc/chatbot-core by walking up to /app/node_modules.
#
# Debian slim rather than Alpine: @swc/core ships glibc prebuilds, and a musl
# mismatch is not something worth debugging during a demo week.

# ---------- builder ----------
FROM node:20-slim AS builder
WORKDIR /app

# Manifests first so the dependency layer is cached independently of source
# edits. Every workspace matched by the root `apps/**` glob must be present
# or npm ci rejects the lockfile.
COPY package.json package-lock.json ./
COPY apps/backend/package.json      apps/backend/
COPY apps/chatbot-core/package.json apps/chatbot-core/
COPY apps/storefront/package.json   apps/storefront/
COPY apps/design/package.json       apps/design/

RUN npm ci --no-audit --no-fund

COPY . .

# chatbot-core first: @dtc/backend imports it from dist/, which does not exist
# until tsc has run.
RUN npm run build --workspace=@dtc/chatbot-core

# The admin dashboard's vite build fails in this hoisted tree (tailwind
# resolves an undefined `content` pattern and postcss throws). The same
# workaround the CI build uses. The storefront is what serves the UI; Medusa
# admin is not part of the deployed surface.
ENV DISABLE_MEDUSA_ADMIN=true
RUN npm run build --workspace=@dtc/backend


# ---------- runner ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/backend/package.json      apps/backend/
COPY apps/chatbot-core/package.json apps/chatbot-core/
COPY apps/storefront/package.json   apps/storefront/
COPY apps/design/package.json       apps/design/

# Recreates the @dtc/* workspace symlinks without devDependencies. The medusa
# CLI survives this: @medusajs/cli is a runtime dependency of @dtc/backend.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Compiled output only — no TypeScript sources in the runtime image.
COPY --from=builder /app/apps/chatbot-core/dist         apps/chatbot-core/dist
COPY --from=builder /app/apps/backend/.medusa/server    apps/backend/.medusa/server

# Medusa reads PORT and binds 0.0.0.0; Railway injects PORT at runtime.
EXPOSE 9000

# `medusa start` is resolved from /app/node_modules/.bin — npm puts every
# ancestor node_modules/.bin on PATH when running a script.
WORKDIR /app/apps/backend/.medusa/server
CMD ["npm", "run", "start"]
