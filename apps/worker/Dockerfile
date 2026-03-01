FROM oven/bun:1.3.9 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/database/package.json ./packages/database/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter worker --filter database --no-progress

FROM oven/bun:1.3.9 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY package.json bun.lock* ./
COPY apps/worker ./apps/worker
COPY packages/database ./packages/database
RUN cd packages/database && bunx prisma generate

FROM oven/bun:1.3.9 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

USER bun
EXPOSE 9091

CMD ["bun", "run", "apps/worker/src/index.ts"]
