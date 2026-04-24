# ───────────────────────────────────────────────────────────
#  Tajik Music CRM — production image
#  Билдит API + статику фронта в одном образе.
#  Запускает только API (фронт раздаётся nginx-сервисом из compose).
# ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Stage 1: install deps (используем lockfile для повторяемости) ──
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/crm-panel/package.json artifacts/crm-panel/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/ lib/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ─────────────────────────────────────────
FROM deps AS build
COPY . .
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH} \
    PORT=3001 \
    NODE_ENV=production
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/crm-panel run build

# ── Stage 3: runtime (минимальный образ для API) ───────────
FROM node:20-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV NODE_ENV=production

# Только то, что реально нужно в runtime
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/.npmrc ./
COPY --from=build /app/artifacts/api-server/package.json artifacts/api-server/
COPY --from=build /app/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /app/lib lib
# Фронтовая статика — для удобства подмонтировать в nginx через volume
COPY --from=build /app/artifacts/crm-panel/dist artifacts/crm-panel/dist
# Drizzle нужен для миграций (lib/db/src/migrate.ts → drizzle-kit migrate)
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
