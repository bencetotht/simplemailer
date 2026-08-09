# SimpleMailer onboarding and integration guide

## Status of this document

This document defines the recommended SimpleMailer integration experience and the
target public contract. It deliberately includes capabilities that are not
implemented yet.

The current API is documented in `README.md` and at `/api/docs`. The work needed
to reach the target described here is tracked in `API_UPGRADE_PLAN.md`.

Projects, scoped key creation/revocation, sender aliases and sender
reconciliation, inline `/v1/messages`, and the initial `@bencetotht/simplemailer`
message client are implemented. The SDK also contains a typed declarative
diff/sync engine, and the CLI can validate JSON/YAML manifests locally.
Project-scoped immutable managed template versions and template
reconciliation are implemented. Sending through a managed template, MJML
compiler sandboxing, and variable-schema enforcement are still target
behavior. The first
signed webhook slice is implemented with project-scoped endpoint management,
replay-safe event IDs, encrypted/rotatable secrets, and leased at-least-once
delivery.
Examples using those pending capabilities are aspirational.

## Design goal

A consuming application should be able to send reliable email with:

1. a SimpleMailer base URL;
2. one project-scoped API credential; and
3. email templates stored alongside the consuming application's source code.

After an operator creates a project credential and configures a sender, no
dashboard interaction should be required. Application changes, including
template changes, should be reviewable, testable, and deployable through code.

SimpleMailer should own:

- service authentication and project isolation;
- accepted-message persistence;
- queueing, pacing, retries, and dead lettering;
- SMTP credentials and delivery;
- delivery status, audit data, metrics, and webhooks;
- optional MJML compilation and optional managed template storage;
- internal object storage such as S3.

The consuming application should own:

- when and why an email is sent;
- recipient selection;
- template source code and application-specific presentation;
- application data used to render the message;
- stable idempotency keys derived from its own business operation.

## The intended onboarding experience

### Unavoidable one-time service setup

Some setup cannot safely be eliminated:

- SimpleMailer infrastructure must be deployed.
- A sending identity must be configured. Depending on the provider this may
  include SMTP credentials, DNS verification, SPF, DKIM, or DMARC.
- A SimpleMailer project and its first API key must be created.

These operations should be automatable through an administrative API, CLI, or
infrastructure-as-code adapter. Secrets should be referenced from environment
variables or a secret manager and must not be committed to source control.

### Per-application setup

The application receives only:

```dotenv
SIMPLEMAILER_URL=https://mailer.example.com
SIMPLEMAILER_API_KEY=sm_live_...
```

The credential identifies the project. The application should not need to know
a database project ID, SMTP account ID, S3 bucket, RabbitMQ exchange, or worker
topology.

For a TypeScript application, the preferred client setup is:

```ts
import { SimpleMailer } from "@bencetotht/simplemailer";

export const mailer = new SimpleMailer({
  baseUrl: process.env.SIMPLEMAILER_URL!,
  apiKey: process.env.SIMPLEMAILER_API_KEY!,
});
```

The SDK must be a convenience layer over a documented HTTP API. Applications in
other languages must be able to use the same API without depending on a
JavaScript runtime.

## Recommended communication boundary

### Use HTTP, not RabbitMQ

Consuming applications should submit messages through the SimpleMailer HTTP
API. They should not publish directly to RabbitMQ.

The HTTP boundary allows SimpleMailer to:

- authenticate and authorize the caller;
- validate and size-limit content;
- persist an immutable accepted message before queue publication;
- enforce idempotency, quotas, and project isolation;
- evolve queue topology without changing every consumer;
- return a stable message ID and status contract.

Direct queue access would bypass those guarantees and couple every application
to SimpleMailer's internal message schema.

### SDK and raw API are equal first-class interfaces

The target TypeScript SDK should provide:

- fully generated or contract-tested request and response types;
- timeouts and abort-signal support;
- structured error classes;
- safe retry guidance;
- first-class idempotency keys;
- methods for message status and template synchronization;
- no browser bundle and no exposure of server credentials to frontend code.

The SDK must not hide network behavior. A method such as `messages.send` means
"SimpleMailer durably accepted the request", not "the recipient received the
email".

The raw REST API remains authoritative:

```http
POST /v1/messages
Authorization: Bearer sm_live_...
Idempotency-Key: verify-email:user_123:token_4
Content-Type: application/json
```

A successful submission returns `202 Accepted`:

```json
{
  "id": "msg_...",
  "status": "queued",
  "createdAt": "2026-07-26T12:00:00.000Z"
}
```

## Sender selection

Applications should address senders by stable, project-scoped aliases:

```json
{
  "sender": "transactional"
}
```

They should not send the current `accountId` database identifier. An operator
maps the alias to an SMTP account or another future delivery provider.

Sender configuration is control-plane data and may contain:

- display name and from address;
- SMTP host, port, username, and encrypted password reference;
- reply-to defaults;
- per-provider throughput and concurrency constraints;
- verification status;
- environment-specific overrides.

Sending credentials require an administrative scope. A normal application key
should only be able to use approved sender aliases.

## Template and message-content approaches

SimpleMailer should support three approaches. They solve different problems and
can coexist behind one discriminated message-body contract.

```ts
type MessageBody =
  | { content: { html: string; text?: string } }
  | {
      content: {
        mjml: string;
        variables?: Record<string, unknown>;
      };
    }
  | {
      template: {
        name: string;
        version?: string;
        variables: Record<string, unknown>;
      };
    };
```

### Approach A: application-rendered HTML and text

This is the recommended default, especially for TypeScript applications.

The application keeps a React Email, MJML, or other template in its repository,
renders it to final HTML and optional plain text, then sends the result:

```tsx
import { render, toPlainText } from "react-email";
import { VerifyEmail } from "../emails/verify-email";
import { mailer } from "./mailer";

const html = await render(
  <VerifyEmail
    name={user.name}
    verificationUrl={verificationUrl}
  />,
);

await mailer.messages.send(
  {
    sender: "transactional",
    to: user.email,
    subject: "Erősítsd meg az email címedet",
    content: {
      html,
      text: toPlainText(html),
    },
    tags: {
      kind: "email-verification",
      userId: user.id,
    },
  },
  {
    idempotencyKey: `verify-email:${user.id}:${tokenVersion}`,
  },
);
```

Advantages:

- templates are versioned with the feature using them;
- React props or application types define the variable contract;
- previews, snapshot tests, and pull-request review stay in the application;
- SimpleMailer is independent of the application's framework and dependencies;
- accepted content can be persisted exactly as it will be delivered.

Trade-offs:

- every application is responsible for rendering correctly;
- request bodies are larger than template-ID requests;
- centrally updating branding does not automatically update all applications.

SimpleMailer should validate size and basic presence but should not rewrite
caller-rendered HTML.

### Approach B: inline MJML and variables

This is a portable convenience for applications that prefer a declarative email
format:

```ts
await mailer.messages.send(
  {
    sender: "transactional",
    to: user.email,
    subject: "Erősítsd meg az email címedet",
    content: {
      mjml: verifyEmailMjml,
      variables: {
        name: user.name,
        verificationUrl,
      },
    },
  },
  {
    idempotencyKey: `verify-email:${user.id}:${tokenVersion}`,
  },
);
```

SimpleMailer must render inline MJML during request acceptance, before the
message is queued. It must:

- use strict MJML validation;
- disable filesystem/network includes unless an explicit safe feature is added;
- apply request body, expansion, and compilation-time limits;
- return actionable synchronous validation errors;
- persist the resulting immutable HTML and optional text;
- queue a reference to the accepted message, not the raw MJML document.

This avoids delayed rendering failures and prevents a retry from producing
different content.

### Approach C: managed, versioned templates

Managed templates are useful when:

- multiple applications intentionally share one template;
- a non-TypeScript application cannot conveniently render email HTML;
- a bulk campaign should reference one reviewed artifact;
- operators require centralized template lifecycle or approval.

Templates should use human-readable, project-scoped names:

```ts
await mailer.templates.upsert({
  name: "verify-email",
  format: "mjml",
  source: verifyEmailMjml,
  subject: "Erősítsd meg az email címedet",
  variablesSchema: {
    type: "object",
    required: ["name", "verificationUrl"],
    properties: {
      name: { type: "string" },
      verificationUrl: { type: "string", format: "uri" },
    },
  },
});
```

Sending by managed template:

```ts
await mailer.messages.send(
  {
    sender: "transactional",
    to: user.email,
    template: {
      name: "verify-email",
      version: "sha256:...",
      variables: {
        name: user.name,
        verificationUrl,
      },
    },
  },
  {
    idempotencyKey: `verify-email:${user.id}:${tokenVersion}`,
  },
);
```

Template upsert must be idempotent. Identical content should return the existing
version. Changed content should create a new immutable version instead of
overwriting content referenced by queued or completed messages.

If `version` is omitted, SimpleMailer resolves the current active version while
accepting the request and stores that resolved version on the message.

### Internal template storage

S3 remains a suitable durable store, but it should be invisible to consumers.
Template and message artifacts should be content-addressed, for example by
SHA-256 digest. PostgreSQL stores metadata and references; S3 stores larger
source or rendered artifacts.

An application should never:

- hold S3 credentials for SimpleMailer;
- upload an object and separately create a database template record;
- know an S3 bucket or object key;
- depend on whether SimpleMailer later replaces S3 with another blob store.

## React Email and MJML

### React Email

React Email is the preferred authoring format for React/TypeScript applications.
It provides typed component props, composition, familiar tooling, and good local
preview and test ergonomics.

React Email source must be rendered in the consuming application or its build
pipeline. SimpleMailer should not accept `.tsx` source for runtime execution.
Uploaded TSX is arbitrary executable code, depends on package versions and build
configuration, and would require a strongly isolated build sandbox.

The portable boundary is the rendered HTML and text, not the React component.

### MJML

MJML is a good language-neutral format. It is declarative, concise, and designed
to compile into responsive email HTML. It is appropriate for inline compilation
or managed templates.

MJML variables are less naturally type-safe. Applications should add their own
schema, or managed templates should declare a JSON Schema-compatible variable
contract.

### Selection guide

| Requirement | Recommended approach |
| --- | --- |
| TypeScript/React application-owned transactional email | React Email rendered to HTML/text in the application |
| Cross-language declarative template | Inline MJML |
| Shared or centrally administered template | Managed versioned MJML template |
| Already-rendered HTML from another system | Inline HTML/text |
| Uploading React/TSX source to SimpleMailer | Unsupported |
| Consumer-managed SimpleMailer S3 objects | Unsupported |

## Message acceptance and delivery semantics

### Immutable accepted messages

`POST /v1/messages` must persist a complete delivery snapshot before publishing
work:

- project and sender resolution;
- recipient envelope;
- subject;
- final HTML and optional text, or immutable artifact references;
- resolved managed-template version, when used;
- safe custom headers, tags, and correlation metadata;
- idempotency key;
- creation time and initial status.

Workers should receive only the message ID and attempt metadata. They must not
resolve a mutable template during each retry.

### At-least-once delivery

SimpleMailer provides at-least-once processing. SMTP cannot guarantee exactly
once: a worker can lose connectivity after an SMTP server accepted the message
but before SimpleMailer persisted success.

The public status model must preserve this uncertainty:

- `accepted`
- `queued`
- `processing`
- `retrying`
- `sent`
- `failed`
- `dead`
- `delivery_uncertain`

`202 Accepted` means the message was durably accepted, not delivered.

### Idempotency

Every business-triggered transactional message should have a stable
idempotency key. Good keys describe the business operation and its version:

```text
verify-email:user_123:token_4
password-reset:user_123:request_8
invoice:invoice_456:issued
```

Idempotency must be scoped to the project. Reusing a key with a different
request body should return a conflict instead of silently returning the original
message.

The SDK may generate a random key only when the caller explicitly requests it;
random keys do not protect a business operation retried after a process crash.

## Authentication and authorization

API keys should:

- have a recognizable prefix and random secret;
- be stored only as a cryptographic hash;
- be shown only once at creation;
- identify one project;
- have explicit scopes;
- support expiry, rotation, revocation, and last-used metadata;
- be accepted as `Authorization: Bearer ...`.

Initial scopes:

- `messages:send`
- `messages:read`
- `templates:read`
- `templates:write`
- `senders:read`
- `senders:write`
- `webhooks:read`
- `webhooks:write`
- `webhooks:replay`
- `admin`

Send-only application keys must not be able to read other recipients, retrieve
template source, inspect SMTP credentials, or mutate control-plane resources.

All list and lookup queries must enforce project ownership in the database
query, not by filtering results after retrieval.

## Status retrieval and webhooks

Applications should be able to retrieve a message:

```http
GET /v1/messages/msg_...
Authorization: Bearer sm_live_...
```

For asynchronous business workflows, signed webhooks are preferred over
polling. Webhook events should include:

- a unique event ID;
- project and message IDs;
- event type and current status;
- attempt number;
- timestamp;
- sanitized failure classification;
- correlation and application tags.

Webhook delivery is itself at-least-once. Consumers must deduplicate by event
ID. Signatures should include a timestamp and raw request body, with replay
protection and documented secret rotation.

## Errors and retry behavior

The API should return a stable error envelope:

```json
{
  "error": {
    "code": "invalid_mjml",
    "message": "MJML validation failed",
    "details": [
      {
        "path": "content.mjml",
        "line": 12,
        "message": "mj-column cannot be nested here"
      }
    ],
    "requestId": "req_..."
  }
}
```

Clients may retry:

- network failures where acceptance is unknown, using the same idempotency key;
- `429`, respecting `Retry-After`;
- documented transient `5xx` responses, using bounded exponential backoff.

Clients should not automatically retry validation, authentication, permission,
or idempotency-conflict errors.

## Declarative synchronization

Managed resources should be definable in a source-controlled manifest:

```ts
import { defineMailer } from "@bencetotht/simplemailer";
import verifyEmailMjml from "./emails/verify-email.mjml";

export default defineMailer({
  senders: {
    transactional: {
      from: "Matekérettségi <no-reply@example.com>",
      credential: { env: "TRANSACTIONAL_SMTP_PASSWORD" },
    },
  },
  templates: {
    "verify-email": {
      format: "mjml",
      subject: "Erősítsd meg az email címedet",
      source: verifyEmailMjml,
    },
  },
});
```

Target CLI workflow:

```bash
simplemailer validate
simplemailer diff
simplemailer sync
```

`validate` operates locally where possible. `diff` is read-only. `sync` uses
idempotent APIs and prints created versions and aliases without requiring users
to copy database IDs.

Destructive changes require explicit flags. Removing a template alias must not
delete immutable versions still referenced by messages.

## Current API compatibility

The current implementation uses:

- `x-api-key: <DASHBOARD_API_KEY>`;
- `accountId` and `templateId`;
- MJML templates stored as local files or S3 objects;
- `POST /api/send` and `POST /api/send/bulk`;
- Handlebars variables rendered in the worker.

During migration, these routes should remain available under their existing
paths until consumers have moved to `/v1`. Compatibility routes should adapt
old requests into the new immutable message model rather than maintain a second
delivery pipeline.

New integrations should target the `/v1` design once Phase 2 of
`API_UPGRADE_PLAN.md` is complete.

## Bulk sending

Bulk sending should use the same project, sender, content, template-version, and
delivery semantics as transactional sending. It must not become a separate
rendering or worker pipeline.

A target bulk API should create one batch plus one independently tracked message
per accepted recipient. This preserves per-recipient retries, idempotency,
delivery uncertainty, and status:

```ts
await mailer.batches.send({
  sender: "transactional",
  template: {
    name: "course-reminder",
    version: "sha256:...",
  },
  sharedVariables: {
    courseName: "Emelt szintű matematika",
  },
  recipients: [
    {
      to: "alice@example.com",
      variables: { name: "Alice" },
      idempotencyKey: "course-reminder:course_1:user_alice:2026-07-26",
    },
    {
      to: "bob@example.com",
      variables: { name: "Bob" },
      idempotencyKey: "course-reminder:course_1:user_bob:2026-07-26",
    },
  ],
  pacing: {
    minimumDelayMs: 5_000,
  },
});
```

For application-rendered HTML, callers may submit independently rendered
messages or a batch whose recipients share the same immutable HTML artifact.
For personalized MJML or managed templates, each accepted recipient must resolve
to immutable rendered content before that recipient is queued for SMTP.

Large batches may be materialized asynchronously, but their states must
distinguish validation/materialization from delivery. Partial acceptance rules
must be explicit, and invalid recipients must never disappear from batch
results.
