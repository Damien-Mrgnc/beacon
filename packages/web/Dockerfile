FROM node:20-alpine AS base
RUN npm install -g pnpm@9

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/tsconfig/      packages/tsconfig/
COPY packages/eslint-config/ packages/eslint-config/
COPY packages/sdk/package.json   packages/sdk/
COPY packages/api/package.json   packages/api/
COPY packages/web/package.json   packages/web/
RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/packages              ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build @beacon/sdk and @beacon/api first (web imports their dist/)
RUN pnpm --filter "@beacon/sdk" build
RUN pnpm --filter "@beacon/api" build
RUN pnpm --filter "@beacon/web" build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static      ./packages/web/.next/static
COPY --from=builder /app/packages/web/public                                  ./packages/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "packages/web/server.js"]
