# SimpleMailer API upgrade plan

## Purpose

This plan upgrades SimpleMailer from its current dashboard-oriented API into the
code-defined integration experience described in `ONBOARDING.md`.

The plan is split into four phases:

1. stabilize the current contract and authentication boundary;
2. create the project-scoped immutable message API;
3. publish the SDK and declarative resource synchronization workflow;
4. complete the production platform layer.

Each phase must leave the repository in a working, documented state. Agents
continuing this work should update the relevant phase with implementation notes,
decisions, migrations, and verification results.

## Non-negotiable architectural decisions

- Applications communicate with SimpleMailer over HTTP, never directly through
  RabbitMQ.
- The public API is usable without the TypeScript SDK.
- Consumer applications may send final HTML/text or inline MJML.
- React Email source is rendered in the consumer and is never executed by
  SimpleMailer.
- Managed templates are optional, project-scoped, and immutable by version.
- S3 is an internal blob store, not part of the consumer contract.
- A message is persisted before queue publication.
- Workers consume a message ID and never resolve mutable template content during
  a retry.
- API keys identify a project and are stored hashed.
- SMTP credentials stay in the control plane and are not visible to send-only
  application keys.
- SMTP delivery remains at-least-once and exposes delivery uncertainty.
- Existing `/api/*` routes remain temporarily compatible and must converge on
  the new delivery service rather than create a parallel pipeline.

## Current baseline and known issues

Before Phase 1 is marked complete, verify the baseline rather than relying on
older claims in `PLAN.md`.

Known at the time this plan was written:

- `pnpm type-check` fails in the worker.
- `consumer.ts` passes a delivery-start callback to `sendMail`, but `mail.ts`
  does not currently declare or use that parameter correctly.
- the local installation could not resolve `@aws-sdk/client-s3` from worker
  TypeScript even though it is declared in `apps/worker/package.json`; confirm
  lockfile/install state before changing package declarations;
- `apps/dashboard/openapi.json` is stale: it does not fully describe current
  route behavior, `202` responses, idempotency, or authentication;
- all protected routes share one `DASHBOARD_API_KEY`;
- dashboard browser code reads `NEXT_PUBLIC_DASHBOARD_API_KEY`, while the README
  correctly says the service credential must not be public;
- rate limiting is in-memory and IP-based;
- template and account identifiers are global database IDs;
- configuration seeding creates missing records but does not reconcile changes;
- jobs store template variables and resolve the current mutable template in the
  worker.

Do not expand the public surface until the baseline builds and its contract can
be tested reliably.

---

# Phase 1: stabilize the contract and authentication boundary

## Objective

Make the existing service internally consistent, buildable, and accurately
documented. Establish a safe boundary on which `/v1` can be built without yet
introducing projects or changing the worker message model.

## 1.1 Restore repository health

- Fix the `sendMail` delivery-start callback contract.
  - The callback must run immediately before calling the SMTP transport.
  - A callback failure must prevent SMTP delivery.
  - Add tests covering callback success, callback failure, and SMTP failure.
- Reconcile the worker's S3 dependency installation.
  - Start with a frozen install using the supported Node range.
  - Modify package metadata only if the lockfile/dependency graph is actually
    incorrect.
- Run:
  - `pnpm install --frozen-lockfile`;
  - `pnpm db:generate`;
  - `pnpm type-check`;
  - `pnpm lint`;
  - `pnpm test`;
  - `pnpm build`.
- Record any unrelated pre-existing failure in this document; do not hide it by
  weakening checks.

## 1.2 Make OpenAPI authoritative

- Choose one source of truth:
  - route-local OpenAPI annotations with deterministic generation, or
  - a shared schema/contract module used by handlers and generation.
- Generate `apps/dashboard/openapi.json` in CI and fail when the checked-in file
  differs.
- Accurately document:
  - `POST /api/send` as `202`;
  - `GET /api/send?enqueueKey=...`;
  - `Idempotency-Key`;
  - `429` and `Retry-After`;
  - `503` enqueue failures;
  - bulk endpoints;
  - template create/update/delete;
  - authentication;
  - all current status values including `DELIVERY_UNCERTAIN`.
- Add an OpenAPI security scheme for the legacy `x-api-key`.
- Add contract tests that compare representative runtime responses to schemas.

## 1.3 Separate dashboard sessions from service credentials

- Remove all use of `NEXT_PUBLIC_DASHBOARD_API_KEY`.
- Do not expose an administrative service key to browser JavaScript.
- Choose and implement one dashboard access model:
  - server-side authenticated dashboard session with route-level authorization;
    or
  - a server-side proxy/BFF that holds the administrative credential.
- Keep server-to-server legacy API access with `DASHBOARD_API_KEY` temporarily.
- In production, fail closed when required authentication configuration is
  missing.
- Document local-development authentication explicitly.

## 1.4 Normalize error and request metadata

- Introduce a shared legacy error envelope with:
  - stable error code;
  - human-readable message;
  - optional validation details;
  - request/correlation ID.
- Ensure logs carry request ID, correlation ID, enqueue key, and job ID without
  logging credentials or full message bodies.
- Validate malformed JSON consistently on all mutation routes.
- Return `404` for missing account/template references instead of a generic
  database `500`.
- Treat an idempotency key reused with a materially different request as a
  conflict.

## 1.5 Harden current request handling

- Add explicit JSON request-size limits at the ingress and application layer.
- Review trusted proxy handling before using forwarded IP headers.
- Add route-specific timeouts around RabbitMQ publication and template storage.
- Keep the current limiter for local development but label it non-HA in code and
  documentation; distributed limiting is Phase 4.
- Add tests for authentication, rate limits, idempotency races, publisher
  failures, and malformed payloads.

## Phase 1 data migrations

No project-model migration is required yet. Small additive columns needed for
request hashes or request IDs are allowed. Migrations must be forward-only and
safe for existing logs.

If request-body hashing is introduced for legacy idempotency checks:

- use a canonical serialization;
- store only the digest;
- backfill is not required for old rows;
- preserve the current response for old records without a digest.

## Phase 1 compatibility

- Existing endpoints and payloads remain available.
- Existing API key configuration remains supported for server-to-server calls.
- No consumer migration is required.

## Phase 1 tests

- Unit tests for mail callback ordering and error classification.
- API tests for every protected mutation route.
- Concurrent idempotency tests.
- OpenAPI snapshot/drift test.
- Fresh-database migration test.
- Worker retry and delivery-uncertainty regression tests.

## Phase 1 exit criteria

- All repository verification commands pass on a supported Node version.
- No browser bundle contains a SimpleMailer service credential.
- OpenAPI reflects actual current behavior and includes authentication.
- Current send and bulk flows have contract tests.
- Known baseline inconsistencies are fixed or explicitly carried forward with an
  owner and reason.

## Phase 1 implementation notes

In progress as of 2026-07-26:

- Fixed the worker `sendMail` callback contract. The delivery-start callback is
  awaited immediately before the nodemailer transport call, and callback
  failure prevents SMTP delivery. Tests cover success ordering, callback
  failure, and SMTP failure classification.
- Confirmed the worker S3 package is present in both package metadata and the
  frozen lockfile. A frozen install completed without changing the S3
  dependency declaration.
- Added an additive nullable SHA-256 request digest to legacy logs and bulk
  batches. Canonical request serialization now rejects same-key/different-body
  reuse with `409`; old rows without a digest preserve their existing replay
  behavior.
- Replaced browser use of `NEXT_PUBLIC_DASHBOARD_API_KEY` with an HttpOnly,
  HMAC-signed dashboard session and a server-side same-origin proxy. Legacy
  `x-api-key` access remains available to server callers. Production fails
  closed when dashboard/session/API authentication configuration is missing.
- Added a shared legacy error envelope, propagated request/correlation IDs on
  send paths, consistent bounded JSON parsing, explicit account/template
  `404`s, trusted-proxy opt-in, and route-level template-storage timeouts.
- Made `apps/dashboard/lib/legacy-contract.ts` the OpenAPI source of truth.
  `apps/dashboard/openapi.json` is deterministically generated, CI checks drift,
  legacy authentication and all current statuses are documented, and contract
  tests validate representative runtime responses.
- The in-memory rate limiter is explicitly documented and labeled non-HA.
- Verification completed on Node 22.23.1: frozen install,
  `pnpm db:generate`, `pnpm type-check`, `pnpm lint`, `pnpm test`, and
  `pnpm build` all pass. The complete migration history, including the new
  digest columns, also applied successfully to a fresh PostgreSQL 17 database.
  The production browser bundle contains no dashboard service credential.
- A production-mode dashboard smoke test confirmed password login, the signed
  HttpOnly session, authenticated BFF access, and rejection of an invalid direct
  legacy API key.
- Phase 1 remains marked in progress pending broader live RabbitMQ
  timeout/outage exercises rather than treating unit/build success as proof of
  the full operational boundary.

---

# Phase 2: project-scoped immutable message API

## Objective

Introduce `/v1` with projects, scoped API keys, sender aliases, inline content,
managed template versions, immutable accepted messages, and direct status
retrieval. Adapt the worker to deliver persisted messages by ID.

## 2.1 Add the project and credential model

Add models equivalent to:

### `Project`

- `id`
- stable `slug`
- display `name`
- status (`ACTIVE`, `SUSPENDED`)
- timestamps
- optional default retention policy

### `ApiKey`

- `id`
- `projectId`
- human-readable `name`
- non-secret prefix/key identifier
- cryptographic key hash
- scopes
- optional expiry
- `lastUsedAt`
- `revokedAt`
- timestamps

Requirements:

- generate at least 256 bits of random secret material;
- show the full secret once;
- compare hashes safely;
- never log or return the secret later;
- cache authentication only with short, revocation-aware semantics;
- support key rotation with overlapping validity.

Create a bootstrap/admin-only mechanism to create the first project and key.
This may initially be a CLI command run within the trusted deployment
environment.

## 2.2 Add project-scoped sender aliases

Replace application-facing account IDs with a `Sender` resource:

- `id`
- `projectId`
- unique `(projectId, alias)`
- display name and from address
- reply-to defaults
- reference to encrypted SMTP/provider credentials
- status and verification metadata
- throughput/concurrency settings
- timestamps

The existing `Account` model may initially remain as the credential/provider
record. Introduce an explicit relation or migrate it into a clearer
`DeliveryCredential` model.

Rules:

- send keys may select only active senders in their own project;
- SMTP passwords require administrative write scope;
- credential values are never returned after creation;
- sender lookup in a send request is atomic with project authorization.

## 2.3 Define immutable content artifacts

Add a content abstraction suitable for HTML, text, MJML sources, and managed
template versions.

Suggested metadata model:

### `ContentArtifact`

- `id`
- `projectId`
- SHA-256 digest
- media type/format (`HTML`, `TEXT`, `MJML`)
- byte length
- inline database content for small artifacts or private S3 object reference
- creation timestamp
- unique `(projectId, digest, format)`

S3 object keys should be derived internally from project and digest. S3
credentials, bucket names, and object keys never appear in public responses.

Define thresholds for database versus object-store content and test both paths.
Object creation and database metadata must tolerate retries and orphan cleanup.

## 2.4 Add managed template aliases and immutable versions

Suggested models:

### `TemplateAlias`

- `id`
- `projectId`
- unique `(projectId, name)`
- active version ID
- timestamps

### `TemplateVersion`

- `id`
- `templateAliasId`
- immutable source artifact ID
- format
- optional subject
- optional variable JSON Schema
- source/render compiler version
- digest
- created-by key/admin identity
- timestamp

Requirements:

- upserting identical content returns the existing version;
- changed source creates a new version;
- activating a version is separate and auditable;
- deleting an alias cannot delete versions referenced by messages;
- variable validation occurs before accepting a message;
- a request without an explicit version resolves and records the active version
  during acceptance.

## 2.5 Add the immutable message model

Introduce a new `Message` model rather than overloading the current `Log` until
migration behavior is proven.

Suggested fields:

- `id`
- `projectId`
- `senderId`
- recipient envelope (`to`, later optional `cc`/`bcc`)
- resolved from/reply-to
- subject
- HTML artifact ID
- optional text artifact ID
- optional template version ID
- safe headers
- tags/application metadata
- idempotency key
- canonical request digest
- correlation/request ID
- lifecycle status
- retry/lease/delivery-attempt fields currently stored on `Log`
- failure class and sanitized failure message
- accepted, queued, processing, completed timestamps
- retention/deletion timestamps

Indexes and constraints:

- unique `(projectId, idempotencyKey)` when a key is present;
- project/status/created-time indexes;
- queue reconciler indexes;
- processing lease indexes;
- template version and sender indexes.

Do not expose internal credential or artifact locations through relations.

## 2.6 Implement `POST /v1/messages`

Authentication:

- `Authorization: Bearer ...`;
- require `messages:send`;
- infer the project from the key.

Supported content:

```ts
type CreateMessageRequest =
  | {
      sender: string;
      to: string | string[];
      subject: string;
      content: { html: string; text?: string };
      tags?: Record<string, string>;
    }
  | {
      sender: string;
      to: string | string[];
      subject: string;
      content: {
        mjml: string;
        variables?: Record<string, unknown>;
      };
      tags?: Record<string, string>;
    }
  | {
      sender: string;
      to: string | string[];
      template: {
        name: string;
        version?: string;
        variables: Record<string, unknown>;
      };
      tags?: Record<string, string>;
    };
```

Initial scope may restrict `to` to one recipient if multi-recipient delivery
semantics are not yet explicit. Do not silently model multiple recipients as
one delivery status.

Acceptance transaction:

1. authenticate key and scope;
2. validate payload, addresses, safe headers, tags, and size;
3. resolve sender inside the project;
4. resolve and validate managed template, if used;
5. compile MJML with strict validation, safe include settings, and bounded time;
6. generate optional plain text according to a documented rule;
7. create/deduplicate content artifacts;
8. compute canonical request digest;
9. enforce project-scoped idempotency;
10. persist the immutable message as enqueue-pending;
11. publish the message ID with publisher confirms;
12. mark queued and return `202`.

If publication fails after persistence, retain enqueue-pending state for the
reconciler and return a documented transient response. A same-key retry must
return the original message.

## 2.7 Add message retrieval

Implement:

- `GET /v1/messages/{id}`;
- optional `GET /v1/messages?status=&createdAfter=&cursor=`;
- lookup by idempotency key if needed.

Require `messages:read`. Every query must include `projectId`.

Do not return full bodies or sensitive variables by default. If body retrieval
is supported, require a separate scope and audit it.

## 2.8 Change the queue and worker contract

Create a new queue payload version:

```json
{
  "version": 3,
  "messageId": "msg_...",
  "attempt": 0,
  "correlationId": "..."
}
```

The worker:

- loads one immutable message snapshot;
- loads sender credentials separately;
- never fetches mutable template source;
- sends persisted subject/HTML/text/from/reply-to;
- uses the existing processing-lease and delivery-uncertainty guarantees;
- updates `Message`, not a second unrelated status record;
- emits project-aware metrics without high-cardinality or recipient labels.

Keep queue payloads small. Do not place HTML, MJML, variables, or credentials in
RabbitMQ messages or dead-letter headers.

## 2.9 Adapt legacy routes

`POST /api/send` and bulk routes should translate legacy `accountId`,
`templateId`, and values into the new acceptance service.

Migration strategy:

- create a legacy/default project;
- associate existing accounts/templates with it;
- resolve the existing template once during acceptance;
- persist the immutable rendered result;
- return legacy response shapes;
- keep the same idempotency behavior;
- add deprecation headers and documentation only after `/v1` is usable.

There must be one queue/delivery implementation after adaptation.

## 2.10 Define compiler safety

For MJML:

- strict validation;
- includes disabled by default;
- no arbitrary filesystem paths or remote fetches;
- maximum source size;
- maximum rendered HTML size;
- bounded compile time and concurrency;
- compiler version stored with managed versions/messages;
- tests for expansion abuse and invalid documents.

For variables:

- use a templating configuration that prevents prototype access;
- define HTML escaping behavior;
- validate managed-template variables before interpolation;
- never evaluate JavaScript expressions.

React/TSX source is explicitly rejected.

## 2.11 Converge bulk sending on immutable messages

Keep the current bulk API working while defining a project-scoped `/v1` batch
contract. A batch is orchestration metadata; every accepted recipient becomes
an independently tracked immutable `Message`.

Add or adapt models equivalent to:

### `MessageBatch`

- `id`
- `projectId`
- sender and resolved template/content metadata;
- requested, accepted, rejected, materialized, and terminal counts;
- pacing policy;
- idempotency key and canonical request digest;
- lifecycle status and timestamps.

### `MessageBatchItem`

- `batchId`
- stable sequence;
- recipient;
- per-recipient variables or shared-content reference;
- per-recipient idempotency key;
- validation/materialization error;
- resulting `messageId`;
- timestamps.

Requirements:

- reuse the normal message acceptance and worker pipeline;
- preserve per-recipient retry, failure, and delivery-uncertain states;
- resolve one immutable managed-template version for the batch;
- merge shared and recipient variables deterministically;
- render personalized content before each recipient is delivery-queue eligible;
- define whether validation is all-or-nothing or partial acceptance in the
  public contract;
- expose materialization separately from SMTP delivery;
- retain invalid items in status results;
- pace durably per sender/provider;
- never place a whole bulk batch or large recipient list in one RabbitMQ
  message.

If large-batch materialization becomes asynchronous, persist the batch and items
first and use a reconciler/worker designed for restartable, chunked
materialization. `202` then means the batch definition was accepted, not that
every recipient message is already queue-ready.

## Phase 2 migrations and rollout

Use additive migrations:

1. create new project/key/sender/artifact/template/message tables;
2. create the legacy/default project;
3. associate or map existing resources;
4. deploy dual-reading compatibility code;
5. switch legacy acceptance to the new message service;
6. switch workers to queue v3 while temporarily understanding old messages;
7. drain old queue formats;
8. remove old worker rendering only in a later cleanup migration.

Backfills must be restartable and observable. Do not attempt to reconstruct
historical rendered HTML for already completed messages unless there is a
specific retention requirement.

## Phase 2 tests

- project boundary tests for every lookup and mutation;
- API key hash, scope, expiry, rotation, and revocation tests;
- sender alias authorization tests;
- inline HTML/text acceptance;
- valid and invalid inline MJML;
- managed-template resolution and variable schema validation;
- same-key/same-body and same-key/different-body idempotency;
- concurrent acceptance race tests;
- artifact deduplication and S3 failure tests;
- enqueue reconciliation after publication failure;
- queue v2/v3 compatibility during rollout;
- retry content immutability test;
- delivery uncertainty regression test;
- bulk compatibility tests.
- batch materialization restart and partial-validation tests.

## Phase 2 exit criteria

- A new application can send with only URL, project key, sender alias, and
  inline content.
- No new integration needs account IDs, template IDs, S3, or RabbitMQ details.
- Inline MJML errors are returned synchronously.
- Every accepted message references immutable rendered content.
- Workers consume message IDs and do not render mutable templates.
- Project isolation and scoped authorization have comprehensive tests.
- Legacy send and bulk routes still work through the new delivery path.
- New bulk orchestration creates ordinary immutable messages per recipient.

## Phase 2 implementation notes

In progress as of 2026-07-26:

- Added additive `Project`, hashed/scoped `ApiKey`, project-scoped `Sender`,
  deduplicated `ContentArtifact`, and immutable `Message` models with a
  forward-only migration. The complete migration history applies successfully
  to a fresh PostgreSQL 17 database.
- Added a trusted bootstrap command that creates a project and 256-bit API key,
  prints the full secret once, and can optionally map a sender alias to an
  existing encrypted SMTP account. Keys use a non-secret lookup prefix,
  randomly salted scrypt hashes, constant-time hash comparison, scopes,
  expiry/revocation checks, project suspension checks, and last-used tracking.
- Added the first `/v1/messages` vertical slice: project Bearer authentication,
  `messages:send`/`messages:read` authorization, one-recipient inline HTML/text
  acceptance, project-scoped sender resolution and idempotency, artifact
  deduplication, immutable resolved envelope/content persistence,
  `POST /v1/messages`, and `GET /v1/messages/{id}` without body retrieval.
- Added queue payload version 3 and worker compatibility. The worker loads the
  persisted message snapshot by ID, loads sender credentials separately, never
  renders mutable template data for v3 messages, and preserves the existing
  processing-lease, retry, dead-letter, and delivery-uncertainty behavior.
  Enqueue reconciliation also covers persisted v3 messages after publication
  failure.
- OpenAPI now documents the initial scoped message surface and its Bearer
  scopes. Tests cover key generation/hash verification, request validation,
  project propagation, idempotent replay publication behavior, and delivery
  from persisted content. `pnpm type-check`, `pnpm lint`, `pnpm test`, and
  `pnpm build` pass.
- Still pending in Phase 2: object-store artifact spillover, MJML compiler
  safety, managed template aliases/versions and variable schemas, message
  listing, legacy-route convergence, project-scoped bulk orchestration,
  management endpoints/rotation workflows, and broader boundary/race tests.

---

# Phase 3: SDK and declarative synchronization

## Objective

Make the `/v1` experience easy to adopt, type-safe for TypeScript users, and
fully automatable without dashboard clicks.

## 3.1 Finalize the public API contract

- Move `/v1` schemas into a reusable package.
- Keep runtime validators and OpenAPI generated from the same definitions.
- Adopt stable naming and casing before publishing an SDK.
- Document versioning and compatibility rules:
  - additive optional fields are non-breaking;
  - enum additions must be tolerated by clients where possible;
  - removals and semantic changes require a new API version.
- Add examples for curl, TypeScript, and at least one non-JavaScript language.
- Include authentication scopes and every error response in OpenAPI.

## 3.2 Publish `@simplemailer/sdk`

Create a workspace package that can later be published independently.

Initial surface:

```ts
const mailer = new SimpleMailer({ baseUrl, apiKey });

await mailer.messages.send(request, {
  idempotencyKey,
  signal,
  timeoutMs,
});

await mailer.messages.get(messageId);
await mailer.templates.upsert(template);
await mailer.templates.activate(name, version);
await mailer.templates.list();
await mailer.senders.list();
```

SDK requirements:

- Node/server runtime only for authenticated operations;
- ESM and documented supported Node versions;
- no framework dependency;
- minimal transitive dependencies;
- structured errors containing status, code, details, request ID, and
  `Retry-After`;
- configurable timeout and abort support;
- no unsafe automatic retries of `POST` without an idempotency key;
- bounded retry helper for network/`429`/transient `5xx`;
- explicit user agent/version header;
- tree-shakeable or separated management APIs if practical.

Do not place SMTP credentials or SimpleMailer API keys in frontend bundles.

## 3.3 Add React Email guidance, not runtime execution

- Add an SDK example package using React Email.
- Demonstrate:
  - typed props;
  - local previews;
  - rendering HTML and plain text;
  - passing final content to `messages.send`;
  - stable idempotency keys.
- Do not make React or React Email SDK runtime dependencies.
- Clearly reject attempts to upload TSX as a template format.

## 3.4 Add declarative configuration

Provide a typed `defineMailer` format for TypeScript and a language-neutral YAML
or JSON manifest representing the same resources.

Initial declarative resources:

- sender aliases and non-secret settings;
- secret references, not secret values in generated output;
- managed template aliases and source paths;
- variable schemas;
- active template versions;
- webhook endpoints and subscribed events when Phase 4 implements webhooks.

The manifest should be environment-aware without encouraging secret commits.
Prefer explicit overlays or environment references over arbitrary code during
server-side reconciliation.

## 3.5 Add the CLI

Commands:

```text
simplemailer validate
simplemailer diff
simplemailer sync
simplemailer templates render
simplemailer templates activate
simplemailer keys create
simplemailer keys revoke
```

Behavior:

- `validate` performs local schema and MJML checks where possible;
- `diff` is read-only and produces stable machine-readable output;
- `sync` is repeatable and idempotent;
- identical template content does not create a version;
- destructive operations require an explicit flag;
- secret values are redacted;
- CI mode is non-interactive and returns meaningful exit codes;
- commands print aliases and versions, never require copying database IDs.

The first bootstrap key may still require a trusted deployment command. Normal
application/template changes must not require dashboard use.

## 3.6 Add a reference integration

Integrate a representative TypeScript service such as `matekerettsegi` after the
SDK contract is stable.

Reference integration should include:

- environment validation for URL and project key;
- one shared server-side mailer client;
- a React Email template stored in the consuming repository;
- rendering to HTML/text in the application;
- a service wrapper that derives stable idempotency keys;
- unit tests with a fake SDK transport;
- an integration test against a local SimpleMailer stack;
- documentation of local development and disabled/no-op behavior, if supported.

Do not couple the consumer to SimpleMailer's Prisma or RabbitMQ packages.

## 3.7 Documentation

Update:

- root README quick start;
- `ONBOARDING.md` to distinguish implemented from planned behavior;
- generated API reference;
- migration guide from `accountId`/`templateId`;
- SDK README;
- CLI/manifest reference;
- examples for inline HTML, inline MJML, and managed templates;
- troubleshooting for authentication, validation, rate limiting, enqueue
  uncertainty, and delivery uncertainty.

## Phase 3 tests and release controls

- SDK unit tests with mocked HTTP transport.
- SDK contract tests against a running dashboard API.
- package export/ESM consumer test.
- CLI golden tests for validate/diff.
- idempotent sync tests.
- destructive-change safety tests.
- example compilation tests.
- reference application integration test.
- API/SDK version compatibility matrix in CI.

## Phase 3 exit criteria

- A TypeScript application can install one package and send a rendered email
  using only URL/key configuration.
- Raw HTTP documentation remains complete and equivalent.
- Managed templates and senders can be validated, diffed, and synchronized from
  code without dashboard clicks.
- A reference consumer demonstrates React Email rendered application-side.
- SDK and CLI releases are reproducible and versioned.

## Phase 3 implementation notes

In progress as of 2026-07-26:

- Added publishable ESM workspace packages for `@simplemailer/contracts`,
  `@simplemailer/sdk`, and `@simplemailer/cli`, targeting Node.js 22–24 with
  declaration/source-map output and strict TypeScript settings, including
  `exactOptionalPropertyTypes`.
- Moved the implemented `/v1/messages` request, response, status, and error
  definitions into runtime Zod contracts. Dashboard validation, SDK types, and
  generated OpenAPI schemas now consume those shared definitions.
- Implemented the server-only SDK message client with configurable timeouts,
  abort signals, injectable transports, an explicit user agent, validated
  responses, structured errors, `Retry-After`, and bounded transient retries.
  POST retries are disabled unless an idempotency key is present.
- Added framework-free NestJS provider helpers and a stable injection token.
  React and NestJS are not runtime dependencies.
- Added typed `defineMailer` JSON/YAML resources, environment-variable secret
  references, source-path resolution, stable alias-based diff plans, template
  content digests, activation planning, non-destructive idempotent sync, and
  redacted machine-readable output.
- Added `simplemailer validate`, `diff`, and `sync`; validation is local, CI
  diff uses meaningful exit codes, and remote-only resources are not deleted.
  Unit tests cover HTTP behavior, fake transports, schema validation,
  deterministic diffing, activation reuse, YAML loading, and redaction.
- Project-scoped sender and managed-template management endpoints remain a
  Phase 2 dependency. The SDK/CLI contract is in place, but remote `diff` and
  `sync` cannot complete against the current server until those endpoints and
  immutable template models are implemented.

---

# Phase 4: production platform, events, and HA controls

## Objective

Complete the operational features required for multiple production applications:
signed webhooks, distributed policy enforcement, project-aware observability,
retention controls, and verified HA behavior.

## 4.1 Add signed delivery webhooks

Suggested models:

### `WebhookEndpoint`

- `id`
- `projectId`
- URL
- encrypted signing secret
- subscribed event types
- active/disabled state
- failure counters and timestamps

### `WebhookEvent`

- `id`
- `projectId`
- `messageId`
- event type
- immutable sanitized payload
- occurrence timestamp

### `WebhookDelivery`

- event and endpoint IDs
- attempt count
- status
- next attempt time
- response status/summary
- timestamps

Requirements:

- use an outbox or equivalent transactionally safe event-creation pattern;
- sign the raw body with timestamped HMAC;
- document verification and replay tolerance;
- show the secret once and support overlapping rotation;
- deliver at least once;
- retry with capped exponential backoff and jitter;
- disable or pause persistently failing endpoints according to policy;
- never include SMTP passwords, full message bodies, or unsafe provider
  responses;
- expose replay and endpoint test operations with appropriate scopes.

Initial events:

- `message.accepted`
- `message.queued`
- `message.processing`
- `message.retrying`
- `message.sent`
- `message.failed`
- `message.dead`
- `message.delivery_uncertain`

## 4.2 Add distributed rate limits and quotas

Replace the in-memory IP limiter with shared enforcement, likely Redis-backed.

Policy dimensions:

- project and API key request rate;
- messages accepted per interval;
- recipient count;
- inline source and rendered byte size;
- MJML compilation concurrency/CPU budget;
- sender/provider throughput;
- bulk batch size and pacing;
- optional daily/monthly quota.

Requirements:

- consistent behavior across API replicas;
- trusted-proxy configuration;
- `Retry-After` and structured limit errors;
- fail-open/fail-closed behavior explicitly chosen per limit;
- metrics for allowed/rejected requests without high-cardinality key labels;
- administrative overrides with audit history.

Sender/provider pacing should remain durable and database/queue backed where
loss of limiter state could violate provider constraints.

## 4.3 Add project-aware observability

- Structured logs with request, project, message, correlation, attempt, worker,
  and failure-class fields.
- Never use recipient address, API key ID, template variables, or message ID as
  unbounded Prometheus labels.
- Prometheus metrics for:
  - accepted/rejected messages;
  - queue/publish latency;
  - delivery latency;
  - retry/dead/uncertain totals;
  - webhook delivery outcomes;
  - compiler duration/failures;
  - distributed limiter health;
  - worker and reconciler health.
- OpenTelemetry spans across API acceptance, database persistence, queue
  publication, worker processing, SMTP, and webhooks.
- Correlation IDs propagated without exposing secret or body data.
- Project-level dashboards should use authorized database/API queries rather
  than raw infrastructure access.

## 4.4 Add data retention, privacy, and audit controls

- Define default and per-project retention periods for:
  - rendered content;
  - recipient addresses;
  - tags/application metadata;
  - failure details;
  - webhook payloads and deliveries;
  - operational logs.
- Minimize stored template variables; prefer storing only final immutable
  content required for retry/audit.
- Add redaction or deletion jobs that preserve aggregate operational metrics.
- Document how deletion interacts with immutable delivery/audit requirements.
- Add audit events for:
  - key creation/revocation;
  - sender/credential changes;
  - template activation;
  - webhook changes/replays;
  - administrative message inspection.
- Encrypt sensitive values at rest and define master-key rotation.

## 4.5 Verify API and worker HA

API:

- run multiple dashboard/API replicas;
- use shared rate limits and durable state;
- verify RabbitMQ connection recovery and publisher confirms;
- configure readiness based on required dependencies;
- make shutdown stop accepting requests and drain in-flight publications;
- avoid local filesystem template dependencies in production.

Worker:

- run multiple consumers with explicit prefetch/concurrency;
- preserve processing leases and `DELIVERY_UNCERTAIN`;
- verify reconnect, graceful drain, and stale-worker cleanup;
- exercise circuit breakers per sender/provider without cross-project leakage;
- test queue and DLQ recovery procedures.

Database/RabbitMQ/object store:

- document production topology, backup, restore, and disaster recovery;
- make migrations safe under rolling deployment;
- define object lifecycle and orphan cleanup;
- test enqueue reconciler behavior during dependency outages.

Remove "HA" claims from user-facing documentation until these scenarios are
tested and deployment manifests support them.

## 4.6 Complete operational APIs

Add scoped APIs for:

- webhook configuration and replay;
- API key metadata/rotation/revocation;
- sender status without returning credentials;
- project usage and quota status;
- dead-letter inspection and safe reprocessing;
- delivery-uncertain review;
- retention configuration where allowed.

Administrative reprocessing must require a new idempotency decision and must not
pretend SMTP exactly-once behavior is possible.

## 4.7 Deprecate legacy APIs

After production consumers use `/v1`:

- emit `Deprecation` and `Sunset` headers;
- publish a migration deadline and guide;
- measure remaining legacy use by authenticated caller;
- remove legacy browser key behavior first;
- remove old send/template/account routes only after the documented window;
- retain data migrations and rollback strategy;
- delete old mutable-template worker code after old queue formats are drained.

Do not remove legacy routes solely because the dashboard has migrated.

## Phase 4 tests and operational exercises

- Multi-replica rate-limit consistency.
- API failover during message acceptance.
- RabbitMQ outage before and after database persistence.
- Worker crash before SMTP, during SMTP, and after SMTP acceptance.
- Object-store outage and artifact reconciliation.
- Webhook signature, replay, retry, and rotation tests.
- Project boundary tests for every operational API.
- Retention/redaction integration tests.
- Backup/restore rehearsal.
- Rolling migration test with old and new binaries.
- Load tests for transactional and paced bulk traffic.

## Phase 4 exit criteria

- Multiple API and worker replicas operate without correctness depending on
  process-local state.
- Signed webhooks provide deduplicatable delivery events.
- Project quotas and rate limits are enforced consistently.
- Retention, redaction, and audit policies are implemented and documented.
- Disaster recovery and delivery-uncertainty procedures are tested.
- Legacy API deprecation has measurable adoption data and a safe migration
  window.
- The repository may describe SimpleMailer as production/HA ready only after all
  relevant reliability exercises pass.

## Phase 4 implementation notes

Not started.

---

# Cross-phase agent guidance

## Working method

For each implementation iteration:

1. read `ONBOARDING.md`, this plan, `README.md`, and relevant existing code;
2. inspect the current worktree and preserve unrelated user changes;
3. update the applicable phase's implementation notes;
4. add migrations before relying on new schema fields;
5. update runtime validation, OpenAPI, handlers, SDK, and documentation together;
6. add tests proportional to failure and migration risk;
7. run only relevant checks during iteration, then the full phase exit suite;
8. report compatibility changes and remaining blockers explicitly.

## Definition of done for public API work

A public API change is incomplete unless it includes:

- runtime validation;
- authorization and project isolation;
- stable errors;
- OpenAPI;
- idempotency implications;
- logging/metrics implications;
- unit and integration tests;
- SDK impact, once the SDK exists;
- migration and backward-compatibility notes;
- user-facing documentation.

## Decisions that require explicit reconsideration

Future agents should not casually change these decisions:

- executing uploaded React/TSX is out of scope;
- consumers do not receive RabbitMQ or S3 credentials;
- messages are immutable after acceptance;
- managed template edits create versions;
- project is inferred from the API key;
- SMTP uncertainty is represented, not hidden;
- legacy and `/v1` routes converge on one delivery pipeline.

If new evidence requires changing one, document the rationale and update both
this plan and `ONBOARDING.md` in the same change.
