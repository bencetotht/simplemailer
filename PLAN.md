# SimpleMailer Modernization Plan

## Context

SimpleMailer is a microservice-based email sending platform. Currently it's a pnpm monorepo (`apps/dashboard`, `apps/worker`, `packages/database`) where the NestJS worker acts as a monolith — owning all REST API endpoints, database access, WebSocket server, Prometheus metrics, config seeding, AND queue consumption. The Next.js dashboard is a thin client calling the worker's HTTP API. This architecture makes the worker stateful and tightly coupled, defeating the goal of independent, scalable workers.

**Goals:**
1. Convert to bun + turborepo monorepo
2. Move all API/DB/state logic to Next.js — worker becomes purely stateless
3. Evaluate Convex vs keeping PostgreSQL
4. Improve observability (OpenTelemetry)
5. Improve reliability (circuit breakers, backoff, DLX)

---

## Step 1: Monorepo Conversion (bun + turborepo) ✅ DONE

### What was changed
- `/package.json` — rewritten with bun workspaces, turbo scripts, `packageManager: bun@1.3.9`
- `/turbo.json` — created with task pipeline definitions
- `/pnpm-workspace.yaml` — deleted
- `/pnpm-lock.yaml` — deleted
- `/packages/database/package.json` — removed `packageManager`, replaced `catalog:prisma` with `^6.13.0`, added `clean` script
- `/apps/dashboard/package.json` — added `type-check`, `clean` scripts
- `/apps/worker/package.json` — added `dev`, `type-check`, `clean` scripts

### Verification
- `bun install` — generates `bun.lock`
- `bun run db:generate` — Prisma client via turborepo
- `bun run dev` — both apps start (dashboard on 3001, worker on 3000)
- `bun run build` — builds all packages in correct dependency order

---

## Phase A: Move API to Next.js

**What**: Migrate all REST endpoints from `apps/worker/src/api.controller.ts` + `api.service.ts` to Next.js App Router API routes. Dashboard gets direct DB access via `packages/database`.

### New API routes in `apps/dashboard/app/api/`

| Route file | Methods | Replaces |
|---|---|---|
| `health/route.ts` | GET | `/api/health` |
| `logs/route.ts` | GET | `/api/logs` |
| `jobs/route.ts` | GET | `/api/jobs` |
| `send/route.ts` | POST | `/api/send` |
| `accounts/route.ts` | GET, POST | `/api/account` |
| `buckets/route.ts` | GET, POST | `/api/bucket` |
| `templates/route.ts` | GET | `/api/template` |
| `templates/[id]/route.ts` | GET | `/api/template/:id` |
| `events/route.ts` | GET (SSE) | WebSocket log streaming |
| `admin/seed/route.ts` | POST | Config seeding (from `config.parser.ts`) |
| `admin/dead-letters/route.ts` | GET, POST | Dead letter inspection/reprocessing |
| `metrics/route.ts` | GET | Prometheus `/metrics` |

### New utilities in `apps/dashboard/lib/`
- `rabbitmq.ts` — singleton amqp-connection-manager connection + channel
- `seed.ts` — config.yaml parser (moved from worker's `config.parser.ts`)
- `backoff.ts` — exponential backoff with jitter utility

### Dashboard frontend changes
- `apps/dashboard/lib/api.ts` — change base URL from `http://localhost:3000/api` to `/api`
- Replace `hooks/use-websocket.ts` with `hooks/use-sse.ts` (Server-Sent Events instead of Socket.IO)
- Fix jobs page to use real API instead of mock data

### Worker files to delete after migration
- `apps/worker/src/api.controller.ts`, `api.service.ts`
- `apps/worker/src/websocket.gateway.ts`, `custom.logger.ts`
- `apps/worker/src/config.parser.ts`, `config.error.ts`
- `apps/worker/src/prometheus.service.ts`
- `apps/worker/src/prisma.service.ts`, `db.service.ts`
- `apps/worker/prisma/` (entire duplicate schema directory)

---

## Phase B: Make Worker Stateless

**Fat message format** — the API resolves all references before publishing:
```typescript
interface MailQueueMessage {
  jobId: string;              // Log entry ID for status tracking
  correlationId: string;      // For distributed tracing
  smtp: { host, port, secure, username, password };
  email: { from, to, subject, templateContent, values };
  retry: { maxRetries, currentAttempt, backoffBaseMs };
}
```

**Worker rewrite — plain bun worker (drop NestJS entirely):**
- No framework overhead — just amqplib + nodemailer + mjml + handlebars
- Minimal, fast-starting, tiny footprint — ideal for stateless horizontal scaling
- Consumes from `mailer` queue, sends email, publishes result to `mailer.results`

**Result message published back to Next.js:**
```typescript
interface MailResultMessage {
  jobId: string;
  status: "SENT" | "FAILED";
  error?: string;
  attempt: number;
}
```

**Retry ownership moves to Next.js API:**
- Worker tries once per message. On failure → publishes FAILED to `mailer.results`
- Next.js result consumer checks retry count, calculates backoff with jitter, re-publishes to `mailer` queue with delay (via RabbitMQ delayed message exchange plugin)

**Final worker structure:**
```
apps/worker/
  src/
    index.ts           — entry point: connect to RabbitMQ, consume messages
    consumer.ts        — message handler: validate, compile template, send, publish result
    mailer.ts          — nodemailer SMTP sending
    template.ts        — MJML + Handlebars compilation
    publisher.ts       — publish results to mailer.results queue
    types.ts           — MailQueueMessage, MailResultMessage interfaces
    logger.ts          — structured pino logger
    circuit-breaker.ts — opossum circuit breaker for SMTP
  package.json
  tsconfig.json
```

Worker dependencies: `amqplib`, `amqp-connection-manager`, `nodemailer`, `mjml`, `handlebars`, `pino`, `opossum`.

---

## Phase C: Database Decision

**Recommendation: Keep PostgreSQL + Prisma.** Reasons:
- Already working schema with migrations
- Self-hosted, matching the rest of the stack (RabbitMQ, S3/MinIO)
- Convex adds cloud vendor lock-in to an otherwise fully self-hostable system
- Real-time updates achievable with SSE without Convex
- After Phase B, only Next.js touches the DB — swapping later is contained

**Improvements to make:**
- Consolidate to single schema in `packages/database/prisma/schema.prisma`
- Add composite index on `Log(status, createdAt)` for dashboard queries
- Use Prisma Accelerate or PgBouncer for connection pooling in production
- Consider adding `retryCount`, `lastError`, `completedAt` fields to Log model

---

## Phase D: Observability (OpenTelemetry)

**Dependencies:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, OTLP exporters. Optionally create `packages/telemetry` shared config.

**Instrumentation:**
- Next.js: native `instrumentation.ts` hook (built-in support)
- Worker: loaded via `--require` flag
- Auto-instrument: HTTP, Prisma (`@prisma/instrumentation`), amqplib
- Custom spans: SMTP send, template compilation

**Structured logging:** Replace NestJS Logger + CustomLogger with `pino` (JSON output). Correlation IDs propagated from API → queue message → worker.

**Metrics (OTel native, replaces Prometheus):**
- `mailer.emails.sent`, `.failed`, `.retry` (counters)
- `mailer.queue.depth` (gauge)
- `mailer.email.send_duration` (histogram)

**Infrastructure addition to `compose.yaml`:** OpenTelemetry Collector + Jaeger (or Grafana Tempo) for trace visualization.

---

## Phase E: Reliability Improvements

**Circuit breakers** (using `opossum` library):
- SMTP connections in worker (`apps/worker/src/circuit-breaker.ts`) — open circuit after 5 consecutive failures per SMTP host
- RabbitMQ publishing in Next.js — return 503 if RabbitMQ is down
- DB queries — prevent cascade failures

**Exponential backoff with jitter:**
```typescript
function backoff(attempt: number, baseMs = 1000, maxMs = 60000): number {
  const exp = baseMs * Math.pow(2, attempt);
  const capped = Math.min(exp, maxMs);
  return Math.floor(capped * (0.5 + Math.random() * 0.5));
}
```

**Dead letter exchange:**
- `mailer.dlx` exchange + `mailer.dead-letters` queue
- Messages nacked without requeue go to dead letters
- Admin endpoint for inspection/reprocessing

**RabbitMQ delayed message exchange plugin** for timed retries.

**Graceful shutdown:** SIGTERM handler in worker — cancel consumer, drain in-flight messages, close AMQP connection, exit.

**Rate limiting:** Next.js middleware on `POST /api/send` (per API key/IP).

**Authentication:** API key system for tenants hitting `POST /api/send`. Admin auth for dashboard access.

---

## Implementation Order

1. **Step 1: Monorepo conversion** ✅ DONE
2. **Phase A: Move API to Next.js** — next priority
3. **Phase B: Make worker stateless** — depends on A
4. **Phase C: DB improvements** — alongside A/B
5. **Phase E: Reliability** — after A+B complete
6. **Phase D: Observability** — can parallel with E
