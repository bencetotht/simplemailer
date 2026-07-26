import {
  createInlineMessageSchema,
  messageResponseSchema,
  senderListResponseSchema,
  senderResponseSchema,
  templateListResponseSchema,
  templateUpsertResponseSchema,
  upsertSenderSchema,
  upsertTemplateSchema,
  type CreateInlineMessage,
  type MessageSummary,
  type Sender,
  type Template,
  type UpsertSender,
  type UpsertTemplate,
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
  readonly transport: HttpTransport;

  constructor(options: SimpleMailerOptions | SimpleMailerTransportOptions) {
    this.transport =
      "transport" in options ? options.transport : new FetchTransport(options);
    this.messages = new MessagesClient(this.transport);
    this.senders = new SendersClient(this.transport);
    this.templates = new TemplatesClient(this.transport);
  }
}
