# syntax=docker/dockerfile:1

# ---- Task Bucket production image -------------------------------------------
# Multi-stage: dependencies -> build -> minimal runtime.
# The runtime stage ships Next's standalone output (see next.config.mjs), so it
# contains only the traced server bundle rather than the whole node_modules tree.

ARG NODE_VERSION=22-alpine

# ---- 1. Dependencies --------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
# libc6-compat: sharp (Next's image optimiser) is glibc-built and needs this on
# Alpine's musl.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# ---- 2. Build ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next reads NEXT_TELEMETRY_DISABLED at build time.
ENV NEXT_TELEMETRY_DISABLED=1
# Auth.js wants a secret present during the build. ARG (not ENV) so this
# placeholder never lands in an image layer; the real secret is injected at
# runtime. No DATABASE_URL is needed — lib/db.ts connects lazily on first query.
ARG AUTH_SECRET=build-time-placeholder-not-used-at-runtime
# The workspace-subdomain suffix shown on the signup form. NEXT_PUBLIC_* values
# are inlined into the client bundle at build time, so this must be a build arg
# rather than a runtime env var — set it when you build the production image.
ARG NEXT_PUBLIC_WORKSPACE_DOMAIN=taskbucket.local
ENV NEXT_PUBLIC_WORKSPACE_DOMAIN=${NEXT_PUBLIC_WORKSPACE_DOMAIN}
RUN npm run build

# ---- 3. Runtime -------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as the image's built-in unprivileged user.
USER node

# Standalone output: server.js + the traced subset of node_modules.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

# The standalone server binds HOSTNAME:PORT.
CMD ["node", "server.js"]

# ---- 4. Migrator (one-shot) --------------------------------------------------
# The runtime image is a standalone bundle with no drizzle-kit or scripts/, so
# schema push + the Postgres compatibility shims run from this stage instead.
# Used by the `migrate` service in the compose files.
#
# Default is the versioned path (drizzle/*.sql, tracked in the migrations
# journal) because that is what production needs. The local compose file
# overrides the command with db:push, which suits a throwaway dev volume.
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["sh", "-c", "npm run db:migrate && npm run db:setup"]
