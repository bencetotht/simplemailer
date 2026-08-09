import {
  createInlineMessageSchema,
  messageResponseSchema,
  senderListResponseSchema,
  senderResponseSchema,
  templateListResponseSchema,
  templateUpsertResponseSchema,
  upsertSenderSchema,
  upsertTemplateSchema,
  createWebhookEndpointSchema,
  createApiKeySchema,
  apiKeyCreateResponseSchema,
  apiKeyListResponseSchema,
  updateWebhookEndpointSchema,
  webhookEndpointListResponseSchema,
  webhookEndpointResponseSchema,
  webhookReplayResponseSchema,
  type CreateInlineMessage,
  type MessageSummary,
  type Sender,
  type Template,
  type UpsertSender,
  type UpsertTemplate,
  type CreateWebhookEndpoint,
  type UpdateWebhookEndpoint,
  type WebhookEndpoint,
  type ApiKeySummary,
  type CreateApiKey,
} from "@simplemailer/contracts";
import { SimpleMailerError } from "./errors.js";
import {
  FetchTransport,
  type FetchTransportOptions,
  type HttpTransport,
  type RequestOptions,
} from "./transport.js";

function parseResponse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new SimpleMailerError("SimpleMailer response did not match the public contract", {
      code: "INVALID_RESPONSE",
      details: parsed.error,
    });
  }
  return parsed.data;
}

export class MessagesClient {
  constructor(private readonly transport: HttpTransport) {}

  async send(request: CreateInlineMessage, options?: RequestOptions): Promise<MessageSummary> {
    const body = createInlineMessageSchema.parse(request);
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: "/v1/messages",
      body,
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(messageResponseSchema, response).data;
  }

  async get(messageId: string, options?: RequestOptions): Promise<MessageSummary> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: `/v1/messages/${encodeURIComponent(messageId)}`,
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(messageResponseSchema, response).data;
  }
}

export class ApiKeysClient {
  constructor(private readonly transport: HttpTransport) {}

  async list(options?: RequestOptions): Promise<ApiKeySummary[]> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: "/v1/api-keys",
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(apiKeyListResponseSchema, response).data;
  }

  async create(
    input: CreateApiKey,
    options?: RequestOptions,
  ): Promise<{ key: ApiKeySummary; secret: string }> {
    const body = createApiKeySchema.parse(input);
    const response = parseResponse(
      apiKeyCreateResponseSchema,
      await this.transport.request<unknown>({
        method: "POST",
        path: "/v1/api-keys",
        body,
        ...(options === undefined ? {} : { options }),
      }),
    );
    return { key: response.data, secret: response.secret };
  }

  async revoke(id: string, options?: RequestOptions): Promise<void> {
    await this.transport.request<unknown>({
      method: "DELETE",
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
      ...(options === undefined ? {} : { options }),
    });
  }
}

export class SendersClient {
  constructor(private readonly transport: HttpTransport) {}

  async list(options?: RequestOptions): Promise<Sender[]> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: "/v1/senders",
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(senderListResponseSchema, response).data;
  }

  async upsert(sender: UpsertSender, options?: RequestOptions): Promise<Sender> {
    const body = upsertSenderSchema.parse(sender);
    const response = await this.transport.request<unknown>({
      method: "PUT",
      path: `/v1/senders/${encodeURIComponent(body.alias)}`,
      body,
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(senderResponseSchema, response).data;
  }
}

export class TemplatesClient {
  constructor(private readonly transport: HttpTransport) {}

  async list(options?: RequestOptions): Promise<Template[]> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: "/v1/templates",
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(templateListResponseSchema, response).data;
  }

  async upsert(
    template: UpsertTemplate,
    options?: RequestOptions,
  ): Promise<{ name: string; version: string; digest: string; created: boolean }> {
    const body = upsertTemplateSchema.parse(template);
    const response = await this.transport.request<unknown>({
      method: "PUT",
      path: `/v1/templates/${encodeURIComponent(body.name)}`,
      body,
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(templateUpsertResponseSchema, response).data;
  }

  async activate(name: string, version: string, options?: RequestOptions): Promise<void> {
    await this.transport.request<unknown>({
      method: "POST",
      path: `/v1/templates/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/activate`,
      body: {},
      ...(options === undefined ? {} : { options }),
    });
  }
}

export class WebhooksClient {
  constructor(private readonly transport: HttpTransport) {}

  async list(options?: RequestOptions): Promise<WebhookEndpoint[]> {
    const response = await this.transport.request<unknown>({
      method: "GET",
      path: "/v1/webhooks",
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(webhookEndpointListResponseSchema, response).data;
  }

  async create(
    endpoint: CreateWebhookEndpoint,
    options?: RequestOptions,
  ): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    const body = createWebhookEndpointSchema.parse(endpoint);
    const response = parseResponse(
      webhookEndpointResponseSchema,
      await this.transport.request<unknown>({
        method: "POST",
        path: "/v1/webhooks",
        body,
        ...(options === undefined ? {} : { options }),
      }),
    );
    if (!response.secret) {
      throw new SimpleMailerError("Webhook creation response omitted its one-time secret", {
        code: "INVALID_RESPONSE",
      });
    }
    return { endpoint: response.data, secret: response.secret };
  }

  async update(
    endpointId: string,
    update: UpdateWebhookEndpoint,
    options?: RequestOptions,
  ): Promise<WebhookEndpoint> {
    const body = updateWebhookEndpointSchema.parse(update);
    const response = await this.transport.request<unknown>({
      method: "PATCH",
      path: `/v1/webhooks/${encodeURIComponent(endpointId)}`,
      body,
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(webhookEndpointResponseSchema, response).data;
  }

  async rotateSecret(
    endpointId: string,
    options?: RequestOptions,
  ): Promise<{
    endpoint: WebhookEndpoint;
    secret: string;
    previousSecretValidUntil?: string;
  }> {
    const response = parseResponse(
      webhookEndpointResponseSchema,
      await this.transport.request<unknown>({
        method: "POST",
        path: `/v1/webhooks/${encodeURIComponent(endpointId)}/rotate-secret`,
        body: {},
        ...(options === undefined ? {} : { options }),
      }),
    );
    if (!response.secret) {
      throw new SimpleMailerError("Webhook rotation response omitted its one-time secret", {
        code: "INVALID_RESPONSE",
      });
    }
    return {
      endpoint: response.data,
      secret: response.secret,
      ...(response.previousSecretValidUntil === undefined
        ? {}
        : { previousSecretValidUntil: response.previousSecretValidUntil }),
    };
  }

  async test(endpointId: string, options?: RequestOptions) {
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: `/v1/webhooks/${encodeURIComponent(endpointId)}/test`,
      body: {},
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(webhookReplayResponseSchema, response).data;
  }

  async replay(
    eventId: string,
    endpointId: string,
    options?: RequestOptions,
  ) {
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: `/v1/webhook-events/${encodeURIComponent(eventId)}/replay`,
      body: { endpointId },
      ...(options === undefined ? {} : { options }),
    });
    return parseResponse(webhookReplayResponseSchema, response).data;
  }
}

export interface SimpleMailerOptions extends FetchTransportOptions {
  transport?: never;
}

export interface SimpleMailerTransportOptions {
  transport: HttpTransport;
}

export class SimpleMailer {
  readonly messages: MessagesClient;
  readonly senders: SendersClient;
  readonly templates: TemplatesClient;
  readonly webhooks: WebhooksClient;
  readonly apiKeys: ApiKeysClient;
  readonly transport: HttpTransport;

  constructor(options: SimpleMailerOptions | SimpleMailerTransportOptions) {
    this.transport =
      "transport" in options ? options.transport : new FetchTransport(options);
    this.messages = new MessagesClient(this.transport);
    this.senders = new SendersClient(this.transport);
    this.templates = new TemplatesClient(this.transport);
    this.webhooks = new WebhooksClient(this.transport);
    this.apiKeys = new ApiKeysClient(this.transport);
  }
}
