FROM oven/bun:1.3.9 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/worker/package.json ./apps/worker/
COPY packages/database/package.json ./packages/database/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter dashboard --filter database --no-progress

FROM oven/bun:1.3.9 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY package.json bun.lock* ./
COPY apps/dashboard ./apps/dashboard
COPY packages/database ./packages/database
RUN cd packages/database && bunx prisma generate --config prisma/prisma.config.ts --schema prisma/schema.prisma && cd /app/apps/dashboard && bun run build

FROM oven/bun:1.3.9 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder --chown=bun:bun /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER bun
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "apps/dashboard/server.js"]
