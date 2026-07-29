import { describe, expect, test, vi } from "vitest";
import { SimpleMailer } from "./client.js";
import { SimpleMailerError } from "./errors.js";
import { createSimpleMailerAsyncProvider } from "./nest.js";
import { FetchTransport, type HttpTransport, type TransportRequest } from "./transport.js";

const summary = {
  id: "msg_123",
  status: "QUEUED",
  sender: "transactional",
  to: "person@example.com",
  subject: "Welcome",
  tags: {},
  acceptedAt: "2026-07-26T12:00:00.000Z",
  queuedAt: "2026-07-26T12:00:00.100Z",
  completedAt: null,
  failureClass: null,
  lastError: null,
};
const webhookEndpoint = {
  id: "whe_123",
  url: "https://hooks.example.com/simplemailer",
  description: null,
  events: ["message.sent"],
  status: "ACTIVE",
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  disabledAt: null,
  createdAt: "2026-07-26T12:00:00.000Z",
  updatedAt: "2026-07-26T12:00:00.000Z",
};

describe("SimpleMailer", () => {
  test("supports an injectable transport for unit tests and NestJS services", async () => {
    const requests: TransportRequest[] = [];
    const transport: HttpTransport = {
      async request<T>(request: TransportRequest): Promise<T> {
        requests.push(request);
        return { data: summary } as T;
      },
    };
    const client = new SimpleMailer({ transport });
    await expect(
      client.messages.send(
        {
          sender: "transactional",
          to: "person@example.com",
          subject: "Welcome",
          content: { html: "<p>Welcome</p>" },
        },
        { idempotencyKey: "welcome:123" },
      ),
    ).resolves.toEqual(summary);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/messages",
      options: { idempotencyKey: "welcome:123" },
    });
  });

  test("preserves injected dependency types in the NestJS async provider helper", async () => {
    class Configuration {
      readonly baseUrl = "https://mailer.example.com";
      readonly apiKey = "secret";
    }
    const provider = createSimpleMailerAsyncProvider<[Configuration]>(
      (configuration) => ({
        baseUrl: configuration.baseUrl,
        apiKey: configuration.apiKey,
      }),
      ["CONFIGURATION"],
    );
    await expect(provider.useFactory(new Configuration())).resolves.toBeInstanceOf(SimpleMailer);
  });

  test("exposes typed webhook management without hiding one-time secrets", async () => {
    const requests: TransportRequest[] = [];
    const transport: HttpTransport = {
      async request<T>(request: TransportRequest): Promise<T> {
        requests.push(request);
        return { data: webhookEndpoint, secret: "whsec_once" } as T;
      },
    };
    const client = new SimpleMailer({ transport });

    await expect(
      client.webhooks.create({
        url: webhookEndpoint.url,
        events: ["message.sent"],
      }),
    ).resolves.toEqual({ endpoint: webhookEndpoint, secret: "whsec_once" });
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/webhooks",
      body: { url: webhookEndpoint.url, events: ["message.sent"] },
    });
  });

  test("returns structured errors with retry metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          code: "RATE_LIMITED",
          message: "Slow down",
          requestId: "req_1",
          details: { limit: 10 },
        }),
        { status: 429, headers: { "retry-after": "2" } },
      ),
    );
    const transport = new FetchTransport({
      baseUrl: "https://mailer.example.com",
      apiKey: "secret",
      fetch,
    });
    const error = await transport
      .request({ method: "GET", path: "/v1/messages/msg_1" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimpleMailerError);
    expect(error).toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      requestId: "req_1",
      retryAfterMs: 2_000,
      retryable: true,
    });
  });

  test("does not automatically retry POST requests without an idempotency key", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const transport = new FetchTransport({
      baseUrl: "https://mailer.example.com",
      apiKey: "secret",
      fetch,
    });
    await expect(
      transport.request({
        method: "POST",
        path: "/v1/messages",
        body: {},
        options: { retry: true },
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("retries a transient POST when an idempotency key is present", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: summary }), { status: 202 }));
    const transport = new FetchTransport({
      baseUrl: "https://mailer.example.com",
      apiKey: "secret",
      fetch,
    });
    await expect(
      transport.request({
        method: "POST",
        path: "/v1/messages",
        body: {},
        options: {
          idempotencyKey: "safe",
          retry: { maxAttempts: 2, initialDelayMs: 0 },
        },
      }),
    ).resolves.toEqual({ data: summary });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
