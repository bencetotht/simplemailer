# SimpleMailer

SimpleMailer is a central email delivery service for applications using different technology stacks. Applications submit transactional or bulk mail jobs over HTTP; PostgreSQL stores job state, RabbitMQ distributes ready jobs, and independent workers render MJML and deliver through configured SMTP accounts.

The project is under active stabilization. It is suitable for development and evaluation, but the delivery and scheduling reliability work tracked in the repository must be completed before production use.

## Components

- `apps/dashboard`: Next.js dashboard and HTTP API
- `apps/worker`: long-running RabbitMQ consumer and SMTP executor
- `packages/database`: Prisma schema, client, and migrations
- PostgreSQL: configuration, bulk schedules, delivery state, and worker heartbeats
- RabbitMQ: ready jobs, retry delivery, and dead letters
- S3-compatible storage: intended durable home for MJML templates

## Prerequisites

- Node.js 22
- pnpm 10.28
- Docker with Compose for the local infrastructure

## Local setup

```bash
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `SECRETS_MASTER_KEY`, choose non-default RabbitMQ, MinIO, and API passwords, then start the stack:

```bash
docker compose up --build
```

The dashboard is available at `http://localhost:3001`, RabbitMQ management at `http://localhost:15672`, and worker metrics at `http://localhost:9091/metrics`.

For host-based development:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Verification

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

CI also applies the complete migration history to a fresh PostgreSQL database.

## Template storage

Production templates use AWS S3 by default. Set `S3_BUCKET` and `S3_REGION`; when running on AWS, leave the custom S3 credentials and endpoint unset so the standard AWS credential provider chain can use an ECS task role, EKS workload identity, EC2 instance profile, or local AWS profile.

MinIO and other S3-compatible services are supported by setting `S3_ENDPOINT` and, when required, `S3_FORCE_PATH_STYLE=true`. The local Compose stack configures these compatibility options automatically. Bucket creation is disabled by default for production safety and is enabled locally with `S3_CREATE_BUCKET=true`.

## API

OpenAPI documentation is served at `/api/docs`. Important endpoints include:

- `POST /api/send` for one message
- `POST /api/send/bulk` and `GET /api/send/bulk/{id}` for paced batches
- `/api/account`, `/api/template`, and `/api/bucket` for configuration
- `/api/logs`, `/api/jobs`, and `/api/workers` for operational state

Protected endpoints expect `x-api-key: <DASHBOARD_API_KEY>`. Do not put this service credential in a `NEXT_PUBLIC_*` environment variable.

## Delivery semantics

RabbitMQ delivery and worker execution are at-least-once. SMTP itself cannot provide exactly-once delivery: a process can fail after the SMTP server accepts a message but before the database records success. The reliability implementation must preserve and expose this uncertainty rather than silently claiming exactly-once behavior.

See `PLAN.md` for the stabilization roadmap and current architectural decisions.
