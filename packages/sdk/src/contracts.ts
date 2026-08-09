import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Runtime validators, public API types, and generated JSON schemas. */

export const API_VERSION = "v1";
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
export const API_KEY_SCOPES = [
  "messages:send",
  "messages:read",
  "senders:read",
  "senders:write",
  "templates:read",
  "templates:write",
  "webhooks:read",
  "webhooks:write",
  "webhooks:replay",
  "keys:read",
  "keys:write",
] as const;
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export const MESSAGE_STATUS_VALUES = [
  "ENQUEUE_PENDING",
  "QUEUED",
  "PROCESSING",
  "PENDING",
  "SENT",
  "FAILED",
  "RETRYING",
  "DEAD",
  "DELIVERY_UNCERTAIN",
] as const;

export const messageStatusSchema = z.enum(MESSAGE_STATUS_VALUES);

const tagsSchema = z
  .record(z.string().max(256))
  .refine((tags) => Object.keys(tags).length <= 50, {
    message: "At most 50 tags are allowed",
  });

export const createInlineMessageSchema = z
  .object({
    sender: z.string().trim().min(1).max(128),
    to: z.string().email(),
    subject: z.string().trim().min(1).max(998),
    content: z
      .object({
        html: z.string().min(1).max(512 * 1024),
        text: z.string().max(512 * 1024).optional(),
      })
      .strict(),
    tags: tagsSchema.optional().default({}),
  })
  .strict();

export const messageSummarySchema = z
  .object({
    id: z.string().startsWith("msg_"),
    status: messageStatusSchema,
    sender: z.string(),
    to: z.string().email(),
    subject: z.string(),
    tags: z.record(z.string()),
    acceptedAt: z.string().datetime(),
    queuedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    failureClass: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();

export const messageResponseSchema = z.object({ data: messageSummarySchema }).strict();

export const WEBHOOK_EVENT_NAMES = [
  "message.accepted",
  "message.queued",
  "message.processing",
  "message.retrying",
  "message.sent",
  "message.failed",
  "message.dead",
  "message.delivery_uncertain",
] as const;
export const webhookEventNameSchema = z.enum(WEBHOOK_EVENT_NAMES);
export const webhookEndpointStatusSchema = z.enum(["ACTIVE", "PAUSED", "DISABLED"]);
export const createWebhookEndpointSchema = z
  .object({
    url: z.string().url().max(2048),
    description: z.string().trim().max(256).optional(),
    events: z.array(webhookEventNameSchema).min(1).max(WEBHOOK_EVENT_NAMES.length),
  })
  .strict()
  .refine((value) => new Set(value.events).size === value.events.length, {
    message: "Webhook event subscriptions must be unique",
    path: ["events"],
  });
export const updateWebhookEndpointSchema = z
  .object({
    url: z.string().url().max(2048).optional(),
    description: z.string().trim().max(256).nullable().optional(),
    events: z.array(webhookEventNameSchema).min(1).max(WEBHOOK_EVENT_NAMES.length).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const webhookEndpointSchema = z
  .object({
    id: z.string().startsWith("whe_"),
    url: z.string().url(),
    description: z.string().nullable(),
    events: z.array(webhookEventNameSchema),
    status: webhookEndpointStatusSchema,
    consecutiveFailures: z.number().int().nonnegative(),
    lastSuccessAt: z.string().datetime().nullable(),
    lastFailureAt: z.string().datetime().nullable(),
    disabledAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const webhookEndpointResponseSchema = z
  .object({
    data: webhookEndpointSchema,
    secret: z.string().startsWith("whsec_").optional(),
    previousSecretValidUntil: z.string().datetime().optional(),
  })
  .strict();
export const webhookEndpointListResponseSchema = z
  .object({ data: z.array(webhookEndpointSchema) })
  .strict();
export const webhookReplayResponseSchema = z
  .object({
    data: z.object({
      eventId: z.string().startsWith("evt_"),
      deliveryId: z.string().startsWith("whd_"),
      status: z.literal("PENDING"),
    }),
  })
  .strict();
export const replayWebhookEventSchema = z
  .object({ endpointId: z.string().startsWith("whe_") })
  .strict();

export const apiErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  })
  .passthrough();

export const apiKeySummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string().length(16),
    scopes: z.array(apiKeyScopeSchema),
    expiresAt: z.string().datetime().nullable(),
    lastUsedAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const apiKeyListResponseSchema = z
  .object({ data: z.array(apiKeySummarySchema) })
  .strict();
export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    scopes: z.array(apiKeyScopeSchema).min(1).refine(
      (scopes) => new Set(scopes).size === scopes.length,
      "API key scopes must be unique",
    ),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
export const apiKeyCreateResponseSchema = z
  .object({
    data: apiKeySummarySchema,
    secret: z.string().startsWith("sm_live_"),
  })
  .strict();

export const senderStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export const senderSchema = z
  .object({
    alias: z.string().trim().min(1).max(128),
    displayName: z.string().max(256),
    fromAddress: z.string().email(),
    replyTo: z.string().email().nullable(),
    status: senderStatusSchema,
    maxConcurrency: z.number().int().positive().nullable(),
    maxPerMinute: z.number().int().positive().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const senderListResponseSchema = z.object({ data: z.array(senderSchema) }).strict();
export const upsertSenderSchema = z
  .object({
    alias: z.string().trim().min(1).max(128),
    displayName: z.string().max(256),
    fromAddress: z.string().email(),
    replyTo: z.string().email().optional(),
    status: senderStatusSchema.optional(),
    maxConcurrency: z.number().int().positive().optional(),
    maxPerMinute: z.number().int().positive().optional(),
    credential: z.object({ env: z.string() }).strict().optional(),
  })
  .strict();
export const senderResponseSchema = z.object({ data: senderSchema }).strict();

export const templateFormatSchema = z.enum(["HTML", "MJML"]);
export const templateVersionSchema = z
  .object({
    version: z.string(),
    digest: z.string(),
    format: templateFormatSchema,
    subject: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const templateSchema = z
  .object({
    name: z.string(),
    activeVersion: z.string().nullable(),
    versions: z.array(templateVersionSchema),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const templateListResponseSchema = z.object({ data: z.array(templateSchema) }).strict();

export const upsertTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    format: templateFormatSchema,
    source: z.string().min(1).max(512 * 1024),
    subject: z.string().max(998).optional(),
    variableSchema: z.record(z.unknown()).optional(),
  })
  .strict();
export const templateUpsertResponseSchema = z
  .object({
    data: z.object({
      name: z.string(),
      version: z.string(),
      digest: z.string(),
      created: z.boolean(),
    }),
  })
  .strict();

const secretReferenceSchema = z
  .object({
    env: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  })
  .strict();

export const declarativeSenderSchema = z
  .object({
    alias: z.string().trim().min(1).max(128),
    displayName: z.string().max(256),
    fromAddress: z.string().email(),
    replyTo: z.string().email().optional(),
    status: senderStatusSchema.optional(),
    maxConcurrency: z.number().int().positive().optional(),
    maxPerMinute: z.number().int().positive().optional(),
    credential: secretReferenceSchema.optional(),
  })
  .strict();

export const declarativeTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    format: templateFormatSchema,
    source: z.object({ path: z.string().min(1) }).strict(),
    subject: z.string().max(998).optional(),
    variableSchema: z.record(z.unknown()).optional(),
    activate: z.boolean().optional(),
  })
  .strict();

export const mailerManifestSchema = z
  .object({
    apiVersion: z.literal("simplemailer/v1"),
    environment: z.string().min(1).optional(),
    senders: z.array(declarativeSenderSchema).default([]),
    templates: z.array(declarativeTemplateSchema).default([]),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const [field, values] of [
      ["senders", manifest.senders.map((sender) => sender.alias)],
      ["templates", manifest.templates.map((template) => template.name)],
    ] as const) {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, index, field === "senders" ? "alias" : "name"],
            message: `Duplicate ${field === "senders" ? "sender alias" : "template name"}: ${value}`,
          });
        }
        seen.add(value);
      });
    }
  });

export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type CreateInlineMessage = z.input<typeof createInlineMessageSchema>;
export type ParsedCreateInlineMessage = z.output<typeof createInlineMessageSchema>;
export type MessageSummary = z.infer<typeof messageSummarySchema>;
export type WebhookEventName = z.infer<typeof webhookEventNameSchema>;
export type CreateWebhookEndpoint = z.infer<typeof createWebhookEndpointSchema>;
export type UpdateWebhookEndpoint = z.infer<typeof updateWebhookEndpointSchema>;
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
export type CreateApiKey = z.infer<typeof createApiKeySchema>;
export type Sender = z.infer<typeof senderSchema>;
export type UpsertSender = z.infer<typeof upsertSenderSchema>;
export type Template = z.infer<typeof templateSchema>;
export type UpsertTemplate = z.infer<typeof upsertTemplateSchema>;
export type MailerManifest = z.input<typeof mailerManifestSchema>;
export type ParsedMailerManifest = z.output<typeof mailerManifestSchema>;

function openApiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const result = zodToJsonSchema(schema, {
    target: "jsonSchema2019-09",
    $refStrategy: "none",
  });
  const { $schema: _, ...withoutSchema } = result;
  return withoutSchema;
}

export const publicJsonSchemas = {
  ApiError: openApiSchema(apiErrorSchema),
  ApiKeySummary: openApiSchema(apiKeySummarySchema),
  ApiKeyListResponse: openApiSchema(apiKeyListResponseSchema),
  CreateApiKeyRequest: openApiSchema(createApiKeySchema),
  ApiKeyCreateResponse: openApiSchema(apiKeyCreateResponseSchema),
  CreateInlineMessageRequest: openApiSchema(createInlineMessageSchema),
  MessageSummary: openApiSchema(messageSummarySchema),
  MessageResponse: openApiSchema(messageResponseSchema),
  CreateWebhookEndpointRequest: openApiSchema(createWebhookEndpointSchema),
  UpdateWebhookEndpointRequest: openApiSchema(updateWebhookEndpointSchema),
  WebhookEndpoint: openApiSchema(webhookEndpointSchema),
  WebhookEndpointResponse: openApiSchema(webhookEndpointResponseSchema),
  WebhookEndpointListResponse: openApiSchema(webhookEndpointListResponseSchema),
  WebhookReplayResponse: openApiSchema(webhookReplayResponseSchema),
  ReplayWebhookEventRequest: openApiSchema(replayWebhookEventSchema),
  Sender: openApiSchema(senderSchema),
  SenderListResponse: openApiSchema(senderListResponseSchema),
  UpsertSenderRequest: openApiSchema(upsertSenderSchema),
  SenderResponse: openApiSchema(senderResponseSchema),
  Template: openApiSchema(templateSchema),
  TemplateListResponse: openApiSchema(templateListResponseSchema),
  UpsertTemplateRequest: openApiSchema(upsertTemplateSchema),
  TemplateUpsertResponse: openApiSchema(templateUpsertResponseSchema),
  MailerManifest: openApiSchema(mailerManifestSchema),
} as const;
