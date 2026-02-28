# SimpleMailer Stabilization + Modernization Plan

Last updated: 2026-02-28

## Current state (validated from repository)

The existing plan direction is mostly right, but several "done" items are not actually done yet.

### Confirmed issues
- `bun run build` fails in `apps/worker` due to broken Prisma type resolution.
  - `apps/worker/tsconfig.json` maps `@prisma/client` to `../prisma/generated/client`, which does not exist in this repo layout.
- `bun run type-check` fails for the same reason (`Account`, `Template`, `Status` etc. not found).
- Monorepo migration is partial: app-level lockfiles still exist.
  - `apps/dashboard/pnpm-lock.yaml`
  - `apps/dashboard/package-lock.json`
  - `apps/worker/pnpm-lock.yaml`
- `bun run lint` fails because `apps/dashboard` has no committed ESLint config and `next lint` prompts interactively.
- API migration to Next.js has not started yet (no `apps/dashboard/app/api/*` routes).
- Worker still mixes many concerns (HTTP API, queue consuming, DB access, metrics, websocket, config parsing).

## North-star goals
1. Keep bun + turborepo monorepo and make it reliable (`build`/`type-check`/`lint` green).
2. Move dashboard-facing API responsibilities to Next.js.
3. Make worker stateless for mail execution and queue consumption.
4. Keep PostgreSQL + Prisma for now (Convex is optional, not urgent).
5. Add production-grade reliability and observability.

## Phase 0: Stabilize baseline first (must complete before feature migration)

### Scope
- Fix Prisma typing in worker.
  - Remove incorrect `@prisma/client` path alias in `apps/worker/tsconfig.json`, or correctly point worker to shared `packages/database` exports.
- Make monorepo package-manager state consistent.
  - Remove stale `pnpm-lock.yaml` and `package-lock.json` files inside apps.
- Make lint non-interactive and reproducible.
  - Commit dashboard ESLint config and ensure `bun run lint` runs in CI without prompts.
- Update docs/scripts to bun+turborepo reality.
  - Remove stale Next boilerplate README instructions in `apps/dashboard/README.md`.

### Exit criteria
- `bun run db:generate` succeeds.
- `bun run type-check` succeeds.
- `bun run build` succeeds.
- `bun run lint` succeeds non-interactively.

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

## Phase B: Worker simplification (stateless execution service)

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
1. Phase 0 (stabilize baseline and tooling correctness)
2. Phase A (dashboard-facing API migration with parity)
3. Phase B (remove worker HTTP/websocket responsibilities)
4. Phase C (finalize single Prisma ownership + indexes)
5. Phase D and Phase E in parallel after A+B are stable

## Short recommendation summary
- Treat the previous "Step 1 done" claim as partial, not complete.
- Do not place core retry/result consumers inside Next.js request runtime.
- Prioritize green build/type/lint before architecture refactors.
- Keep PostgreSQL/Prisma for now; revisit Convex only after boundaries stabilize.
