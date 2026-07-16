FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/database/package.json ./packages/database/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter worker --filter database

FROM base AS builder
ENV DATABASE_URL=postgresql://prisma:prisma@localhost:5432/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages/database ./packages/database
RUN pnpm --filter database db:generate

FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/worker ./apps/worker
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml config.yaml ./

USER node
EXPOSE 9091

CMD ["node", "apps/worker/node_modules/tsx/dist/cli.mjs", "apps/worker/src/index.ts"]
