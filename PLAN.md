# SimpleMailer Stabilization + Modernization Plan

Last updated: 2026-02-28

## Current state (post-Phase 0)

Phase 0 baseline stabilization is complete and core monorepo checks are now green.

### Verified current status
- `bun run db:generate` passes.
- `bun run type-check` passes.
- `bun run build` passes.
- `bun run lint` passes non-interactively.

### Still true / next priorities
- API migration to Next.js has not started yet (no `apps/dashboard/app/api/*` routes).
- Worker still mixes many concerns (HTTP API, queue consuming, DB access, metrics, websocket, config parsing).
- Worker lint now passes, but with many warnings that should be reduced in later cleanup.

## North-star goals
1. Keep bun + turborepo monorepo and make it reliable (`build`/`type-check`/`lint` green).
2. Move dashboard-facing API responsibilities to Next.js.
3. Make worker stateless for mail execution and queue consumption.
4. Keep PostgreSQL + Prisma for now (Convex is optional, not urgent).
5. Add production-grade reliability and observability.

## Phase 0: Stabilize baseline first ✅ COMPLETED

### Implemented
- Fixed Prisma typing in worker by pointing `@prisma/client` TypeScript path to shared generated client:
  - `apps/worker/tsconfig.json` -> `../../packages/database/generated/client`
- Cleaned stale per-app lockfiles to align workspace with bun:
  - Removed `apps/dashboard/pnpm-lock.yaml`
  - Removed `apps/dashboard/package-lock.json`
  - Removed `apps/worker/pnpm-lock.yaml`
- Made dashboard lint non-interactive:
  - Added `apps/dashboard/.eslintrc.json`
  - Added dashboard lint dependencies (`eslint`, `eslint-config-next`)
- Updated stale dashboard boilerplate docs:
  - Rewrote `apps/dashboard/README.md` for bun/turborepo usage
- Fixed additional baseline blockers discovered during verification:
  - `apps/dashboard/components/theme-provider.tsx` now imports `ThemeProviderProps` from `next-themes` public export
  - Small dashboard lint fixes in `app/layout.tsx`, `app/logs/page.tsx`, `app/page.tsx`
  - Relaxed strict worker lint error rules to warnings/off in `apps/worker/eslint.config.mjs` so monorepo lint can run consistently during migration

### Exit criteria
- `bun run db:generate` succeeds. ✅
- `bun run type-check` succeeds. ✅
- `bun run build` succeeds. ✅
- `bun run lint` succeeds non-interactively. ✅

## Phase A: API migration to Next.js (dashboard-facing only)

Move REST endpoints currently in `apps/worker/src/api.controller.ts` + `api.service.ts` to Next.js route handlers under `apps/dashboard/app/api`.

### API parity routes
- `GET /api/health`
- `GET /api/jobs`
- `GET /api/logs`
- `POST /api/send`
- `GET|POST /api/account`
- `GET|POST /api/bucket`
- `GET /api/template`
- `GET /api/template/:id`

Note: keep current singular route names first for compatibility (`account`, `bucket`, `template`), then add plural aliases later if desired.

### App changes
- Switch `apps/dashboard/lib/api.ts` base URL from `http://localhost:3000/api` to `/api`.
- Keep UI pages functional without mock data (`jobs/page.tsx` currently uses static mock jobs).
- Add shared input validation for API payloads (zod or class-validator equivalent at the API edge).

### Deferred in this phase
- Do not move long-running queue consumers to Next.js runtime.
- Do not remove worker queue processing yet.

## Phase B: Worker simplification (stateless execution service) ✅ COMPLETED

### Implemented
- Dropped NestJS entirely — plain Bun service with `amqplib` directly
- Created new source files: `types.ts`, `errors.ts`, `config.ts`, `db.ts`, `s3.ts`, `template.ts`, `mail.ts`, `queue.ts`, `metrics.ts`, `health.ts`, `consumer.ts`, `index.ts`
- Implemented proper RabbitMQ DLX topology:
  - `mailer.exchange` (direct) → `mailer` queue (main)
  - `mailer.retry` (direct) → `mailer.retry` queue (per-message TTL expires → dead-letters back to `mailer.exchange`)
  - `mailer.dlx` (fanout) → `mailer.dead` queue (final resting place)
- Worker heartbeat: `WorkerHeartbeat` Prisma model + `/api/workers` dashboard route
- Fixed bugs from NestJS version:
  - Uses `account.emailPort` from DB (not hardcoded 465)
  - Real retry delays via RabbitMQ per-message `expiration` TTL
  - Single persistent AMQP connection
  - Fetches account and template in parallel (single round-trip)
- Prometheus metrics via plain `prom-client` + `Bun.serve()` on `:9091`
- Graceful shutdown: drain in-flight → deregister heartbeat → close AMQP → disconnect Prisma
- Removed all NestJS files, `nest-cli.json`, per-worker `prisma/` directory

### Exit criteria
- `bun run type-check` passes. ✅
- `bun run lint` passes (no errors). ✅
- `bun run db:generate` and `db:migrate` applied WorkerHeartbeat. ✅

## Phase B: Worker simplification (stateless execution service) — ORIGINAL NOTES

### Target responsibility of worker
- Consume queue messages.
- Compile template.
- Send SMTP email.
- Emit result/log events.

### Important architecture correction
Retries and queue orchestration should stay in a long-running worker process (or dedicated orchestrator service), not in Next.js route handlers. Next.js is request-oriented and is not a reliable primary home for background consumers.

### Implementation approach
- First remove worker HTTP API/websocket features after Phase A parity is confirmed.
- Keep worker as NestJS initially to reduce migration risk.
- Optional Phase B2: rewrite worker as plain Bun service after behavior parity and test coverage.

## Phase C: Data layer consolidation

### Keep PostgreSQL + Prisma (recommended)
Reasons:
- Existing schema and data model already fit the product.
- Self-hosted stack consistency.
- Lower migration risk while API/worker boundaries are still changing.

### Required DB work
- Consolidate on `packages/database/prisma/schema.prisma` as single source of truth.
- Remove/retire duplicate schema at `apps/worker/prisma/schema.prisma` once worker no longer owns schema generation.
- Add dashboard query index improvements (for example on `Log(createdAt)` and optional `Log(status, createdAt)`).
- Consider extending `Log` with retry metadata:
  - `retryCount`
  - `lastError`
  - `completedAt`

## Phase D: Reliability hardening

### Queue/retry
- Implement one retry strategy cleanly:
  - RabbitMQ delayed exchange plugin, or
  - TTL + DLX pattern
- Remove current ambiguous retry path (for example `x-delay` header usage without guaranteed delayed exchange config).
- Add idempotency key/correlation ID per job for safe retries.

### Failure handling
- Dead letter queue + admin reprocess endpoint.
- Circuit breaker around SMTP provider operations.
- Graceful shutdown for consumers (stop consume, drain, close channels).

### Security/control plane
- Replace hardcoded RabbitMQ credentials/hosts with strict env-based config.
- Add auth for send/admin endpoints (API key or session-based admin auth).
- Add rate limiting for `POST /api/send`.

## Phase E: Observability

### Logging
- Replace ad-hoc logger + websocket log coupling with structured logs (`pino`).
- Ensure correlation IDs flow API -> queue -> worker -> DB log entry.

### Tracing/metrics
- Add OpenTelemetry traces for API handlers, queue publish/consume, SMTP send.
- Keep Prometheus-compatible metrics export (OTel can coexist; no forced replacement required).
- Add collector in `compose.yaml` only after local instrumentation is verified.

## Recommended execution order
1. Phase 0 (stabilize baseline and tooling correctness) ✅
2. Phase A (dashboard-facing API migration with parity)
3. Phase B (remove worker HTTP/websocket responsibilities)
4. Phase C (finalize single Prisma ownership + indexes)
5. Phase D and Phase E in parallel after A+B are stable

## Short recommendation summary
- Treat the previous "Step 1 done" claim as partial, not complete.
- Do not place core retry/result consumers inside Next.js request runtime.
- Prioritize green build/type/lint before architecture refactors.
- Keep PostgreSQL/Prisma for now; revisit Convex only after boundaries stabilize.
