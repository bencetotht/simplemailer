# `@simplemailer/sdk`

Server-side, ESM-only TypeScript SDK for SimpleMailer. It supports Node.js
22–24 and has no framework dependency.

```ts
import { SimpleMailer } from "@simplemailer/sdk";

const mailer = new SimpleMailer({
  baseUrl: process.env.SIMPLEMAILER_URL!,
  apiKey: process.env.SIMPLEMAILER_API_KEY!,
});

await mailer.messages.send(
  {
    sender: "transactional",
    to: "person@example.com",
    subject: "Welcome",
    content: { html: "<p>Welcome</p>", text: "Welcome" },
  },
  {
    idempotencyKey: "welcome:user_123",
    retry: true,
    timeoutMs: 5_000,
  },
);
```

Automatic retries are bounded to five attempts and a `POST` is never retried
unless it has an idempotency key. `SimpleMailerError` exposes `status`, `code`,
`details`, `requestId`, `retryAfterMs`, and `retryable`.

Do not instantiate this SDK in browser code or expose its API key through a
`NEXT_PUBLIC_*` variable. React Email should be rendered in the consuming
server application; pass only the resulting HTML and text to `messages.send`.

Control-plane keys with webhook scopes can manage signed endpoints:

```ts
const { endpoint, secret } = await mailer.webhooks.create({
  url: "https://app.example.com/webhooks/simplemailer",
  events: ["message.sent", "message.delivery_uncertain"],
});

// Persist `secret` now: SimpleMailer will not return it again.
await mailer.webhooks.test(endpoint.id);
```

The client also exposes `webhooks.list`, `update`, `rotateSecret`, and `replay`.
Webhook mutation methods are not automatically retried; callers should inspect
the resulting resource or event delivery before repeating a control-plane
operation.

Control-plane keys with `keys:read` and `keys:write` can create and revoke
project credentials through `apiKeys`. A newly generated secret is returned
only by `apiKeys.create`; store it before discarding the response. The API
rejects revoking the credential used for the request so rotation cannot
accidentally lock out the caller.

## NestJS

The optional `@simplemailer/sdk/nest` entry point supplies a stable injection
token and provider helpers without making `@nestjs/common` a dependency:

```ts
import { Module } from "@nestjs/common";
import {
  SIMPLEMAILER,
  createSimpleMailerProvider,
} from "@simplemailer/sdk/nest";

@Module({
  providers: [
    createSimpleMailerProvider({
      baseUrl: process.env.SIMPLEMAILER_URL!,
      apiKey: process.env.SIMPLEMAILER_API_KEY!,
    }),
  ],
  exports: [SIMPLEMAILER],
})
export class MailModule {}
```

The core client also accepts an `HttpTransport`, making it straightforward to
replace with a fake in unit tests.

## Declarative resources

`defineMailer`, `resolveMailerDefinition`, `diffMailerDefinition`, and
`applyMailerSync` provide a typed, deterministic synchronization engine.
Manifests contain template paths and environment-variable secret references;
resolved secret values are not emitted by diff plans.

Sender and immutable managed-template plans can be diffed and applied against
the current project-scoped management endpoints. Managed-template sending and
safe MJML compilation remain separate server capabilities and are not implied
by successful synchronization.
