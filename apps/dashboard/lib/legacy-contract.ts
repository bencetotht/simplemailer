import type { Status } from "database";

export const LEGACY_API_KEY_HEADER = "x-api-key";
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
export const LEGACY_STATUS_VALUES = [
  "ENQUEUE_PENDING",
  "QUEUED",
  "PROCESSING",
  "PENDING",
  "SENT",
  "FAILED",
  "RETRYING",
  "DEAD",
  "DELIVERY_UNCERTAIN",
] as const satisfies readonly Status[];

const json = (schema: Record<string, unknown>) => ({
  "application/json": { schema },
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (description: string, schema: Record<string, unknown> = ref("ErrorResponse")) => ({
  description,
  content: json(schema),
});
const standardErrors = {
  "400": response("Malformed JSON, invalid request, or validation failure"),
  "401": response("Missing or invalid legacy API key"),
  "413": response("Request body exceeds the route limit"),
  "500": response("Unexpected persistence or service failure"),
};
const idempotencyHeader = {
  in: "header",
  name: IDEMPOTENCY_KEY_HEADER,
  required: false,
  schema: { type: "string", maxLength: MAX_IDEMPOTENCY_KEY_LENGTH },
  description: "Makes a mutation replay-safe. Reuse with materially different content returns 409.",
};
const idParameter = {
  in: "path",
  name: "id",
  required: true,
  schema: { type: "string" },
};

const statusSchema = { type: "string", enum: LEGACY_STATUS_VALUES };
const protectedSecurity = [{ LegacyApiKey: [] }];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "SimpleMailer legacy API",
    version: "2.1.0",
    description:
      "The current compatibility API. Server-to-server callers authenticate with x-api-key. Dashboard browsers use an HttpOnly session and a server-side proxy; the administrative API key is never exposed to JavaScript.",
  },
  servers: [{ url: "/" }],
  security: protectedSecurity,
  tags: [
    { name: "Mail" },
    { name: "Accounts" },
    { name: "Templates" },
    { name: "Buckets" },
    { name: "Operations" },
    { name: "System" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        security: [],
        responses: {
          "200": response("API process is running", ref("HealthResponse")),
        },
      },
    },
    "/api/send": {
      post: {
        tags: ["Mail"],
        summary: "Accept and enqueue one mail job",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: json(ref("MailJobRequest")),
        },
        responses: {
          "202": response("Job persisted and accepted for enqueue", ref("SendAcceptedResponse")),
          ...standardErrors,
          "404": response("Referenced account or template does not exist"),
          "409": response("Idempotency key was used with materially different content"),
          "429": {
            ...response("Process-local development rate limit exceeded"),
            headers: {
              "Retry-After": {
                description: "Seconds until another request may be attempted",
                schema: { type: "integer", minimum: 1 },
              },
            },
          },
          "503": response("RabbitMQ publication failed; the persisted job remains enqueue-pending"),
        },
      },
      get: {
        tags: ["Mail"],
        summary: "Find a job by idempotency/enqueue key",
        parameters: [
          {
            in: "query",
            name: "enqueueKey",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": response("Job status", ref("SendStatusResponse")),
          "400": standardErrors["400"],
          "401": standardErrors["401"],
          "404": response("No job exists for the key"),
        },
      },
    },
    "/api/send/bulk": {
      post: {
        tags: ["Mail"],
        summary: "Accept a paced bulk batch",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: json(ref("BulkSendRequest")),
        },
        responses: {
          "202": response("Batch definition persisted", ref("BulkSendAcceptedResponse")),
          ...standardErrors,
          "404": response("Referenced account or template does not exist"),
          "409": response("Idempotency key was used with materially different content"),
          "429": {
            ...response("Process-local development rate limit exceeded"),
            headers: {
              "Retry-After": {
                description: "Seconds until another request may be attempted",
                schema: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
    },
    "/api/send/bulk/{id}": {
      get: {
        tags: ["Mail"],
        summary: "Inspect a bulk batch and its recipient items",
        parameters: [
          idParameter,
          { in: "query", name: "skip", schema: { type: "integer", minimum: 0 } },
          { in: "query", name: "take", schema: { type: "integer", minimum: 1, maximum: 100 } },
          {
            in: "query",
            name: "status",
            schema: { type: "string", enum: ["REJECTED", ...LEGACY_STATUS_VALUES] },
          },
        ],
        responses: {
          "200": response("Bulk batch status", ref("BulkSendBatchResponse")),
          "400": standardErrors["400"],
          "401": standardErrors["401"],
          "404": response("Batch not found"),
        },
      },
    },
    "/api/account": {
      get: {
        tags: ["Accounts"],
        summary: "List SMTP accounts",
        parameters: [{ in: "query", name: "id", schema: { type: "string" } }],
        responses: {
          "200": response("Account summaries", {
            type: "array",
            items: ref("AccountSummary"),
          }),
          "401": standardErrors["401"],
        },
      },
      post: {
        tags: ["Accounts"],
        summary: "Create an SMTP account",
        requestBody: { required: true, content: json(ref("AccountRequest")) },
        responses: {
          "200": response("Account created", ref("SuccessResponse")),
          ...standardErrors,
        },
      },
    },
    "/api/account/{id}": {
      delete: {
        tags: ["Accounts"],
        summary: "Delete an SMTP account",
        parameters: [idParameter],
        responses: {
          "200": response("Account deleted", ref("SuccessResponse")),
          "401": standardErrors["401"],
          "404": response("Account not found"),
          "500": standardErrors["500"],
        },
      },
    },
    "/api/template": {
      get: {
        tags: ["Templates"],
        summary: "List templates",
        responses: {
          "200": response("Template summaries", {
            type: "array",
            items: ref("TemplateSummary"),
          }),
          "401": standardErrors["401"],
        },
      },
      post: {
        tags: ["Templates"],
        summary: "Create a template",
        requestBody: { required: true, content: json(ref("TemplateCreateRequest")) },
        responses: {
          "200": response("Template created", ref("SuccessResponse")),
          ...standardErrors,
          "409": response("Template file already exists"),
          "503": response("Template object storage unavailable"),
        },
      },
    },
    "/api/template/{id}": {
      get: {
        tags: ["Templates"],
        summary: "Read raw MJML template content",
        parameters: [idParameter],
        responses: {
          "200": {
            description: "Raw MJML",
            content: { "text/plain": { schema: { type: "string" } } },
          },
          "401": standardErrors["401"],
          "404": response("Template or content not found"),
        },
      },
      patch: {
        tags: ["Templates"],
        summary: "Update a template",
        parameters: [idParameter],
        requestBody: { required: true, content: json(ref("TemplateUpdateRequest")) },
        responses: {
          "200": response("Template updated", ref("SuccessResponse")),
          ...standardErrors,
          "404": response("Template not found"),
          "503": response("Template object storage unavailable"),
        },
      },
      delete: {
        tags: ["Templates"],
        summary: "Delete a template",
        parameters: [idParameter],
        responses: {
          "200": response("Template deleted", ref("SuccessResponse")),
          "401": standardErrors["401"],
          "404": response("Template not found"),
          "500": standardErrors["500"],
        },
      },
    },
    "/api/bucket": {
      get: {
        tags: ["Buckets"],
        summary: "List S3 bucket configurations",
        responses: {
          "200": response("Bucket summaries without credentials", {
            type: "array",
            items: ref("BucketSummary"),
          }),
          "401": standardErrors["401"],
        },
      },
      post: {
        tags: ["Buckets"],
        summary: "Create an S3 bucket configuration",
        requestBody: { required: true, content: json(ref("BucketRequest")) },
        responses: {
          "200": response("Bucket configuration created", ref("SuccessResponse")),
          ...standardErrors,
        },
      },
    },
    "/api/bucket/{id}": {
      delete: {
        tags: ["Buckets"],
        summary: "Delete an S3 bucket configuration",
        parameters: [idParameter],
        responses: {
          "200": response("Bucket configuration deleted", ref("SuccessResponse")),
          "401": standardErrors["401"],
          "404": response("Bucket not found"),
          "500": standardErrors["500"],
        },
      },
    },
    "/api/logs": {
      get: {
        tags: ["Operations"],
        summary: "List delivery logs",
        parameters: [
          { in: "query", name: "skip", schema: { type: "integer", minimum: 0, default: 0 } },
          { in: "query", name: "take", schema: { type: "integer", minimum: 1, default: 20 } },
          { in: "query", name: "status", schema: statusSchema },
          { in: "query", name: "recipient", schema: { type: "string" } },
        ],
        responses: {
          "200": response("Paginated delivery logs", ref("LogsResponse")),
          "401": standardErrors["401"],
        },
      },
    },
    "/api/stats": {
      get: {
        tags: ["Operations"],
        summary: "Get aggregate delivery statistics",
        responses: {
          "200": response("Aggregate status counts", { type: "object", additionalProperties: true }),
          "401": standardErrors["401"],
        },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Operations"],
        summary: "Peek at redacted RabbitMQ jobs",
        responses: {
          "200": response("Redacted queue messages", {
            type: "array",
            items: { type: "object", additionalProperties: true },
          }),
          "401": standardErrors["401"],
        },
      },
    },
    "/api/workers": {
      get: {
        tags: ["Operations"],
        summary: "List live worker heartbeats",
        responses: {
          "200": response("Workers", {
            type: "array",
            items: { type: "object", additionalProperties: true },
          }),
          "401": standardErrors["401"],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      LegacyApiKey: {
        type: "apiKey",
        in: "header",
        name: LEGACY_API_KEY_HEADER,
        description: "Temporary server-to-server administrative credential.",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        additionalProperties: true,
        required: ["success", "code", "message", "requestId"],
        properties: {
          success: { const: false },
          code: { type: "string" },
          message: { type: "string" },
          requestId: { type: "string" },
          details: {},
          error: { type: "string", description: "Temporary legacy alias for message" },
          fields: { description: "Temporary legacy alias for validation details" },
        },
      },
      SuccessResponse: {
        type: "object",
        required: ["success"],
        properties: {
          success: { const: true },
          message: { type: "string" },
        },
      },
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status", "message", "version"],
        properties: {
          status: { type: "string" },
          message: { type: "string" },
          version: { type: "string" },
        },
      },
      MailJobRequest: {
        type: "object",
        additionalProperties: false,
        required: ["accountId", "templateId", "recipient", "values"],
        properties: {
          accountId: { type: "string", minLength: 1 },
          templateId: { type: "string", minLength: 1 },
          recipient: { type: "string", format: "email" },
          values: { type: "object", additionalProperties: true },
        },
      },
      SendAcceptedResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "jobId", "status"],
        properties: {
          success: { const: true },
          jobId: { type: "string" },
          status: statusSchema,
        },
      },
      SendStatusResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "id", "status", "retryCount", "createdAt", "updatedAt"],
        properties: {
          success: { const: true },
          id: { type: "string" },
          status: statusSchema,
          retryCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      BulkSendRecipient: {
        type: "object",
        required: ["recipient"],
        properties: {
          recipient: { type: "string" },
          values: { type: "object", additionalProperties: true },
        },
      },
      BulkSendRequest: {
        type: "object",
        additionalProperties: false,
        required: ["accountId", "templateId", "recipients"],
        properties: {
          accountId: { type: "string", minLength: 1 },
          templateId: { type: "string", minLength: 1 },
          sharedValues: { type: "object", additionalProperties: true },
          recipients: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            items: ref("BulkSendRecipient"),
          },
          options: {
            type: "object",
            properties: { minDelayMs: { type: "number", minimum: 0 } },
          },
        },
      },
      BulkSendAcceptedResponse: {
        type: "object",
        required: [
          "success",
          "batchId",
          "requestedCount",
          "acceptedCount",
          "rejectedCount",
          "effectiveMinDelayMs",
          "rejectedItems",
        ],
        properties: {
          success: { const: true },
          batchId: { type: "string" },
          requestedCount: { type: "integer" },
          acceptedCount: { type: "integer" },
          rejectedCount: { type: "integer" },
          effectiveMinDelayMs: { type: "integer" },
          rejectedItems: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
      BulkSendBatchResponse: {
        type: "object",
        required: ["success", "batch", "items", "total", "skip", "take"],
        properties: {
          success: { const: true },
          batch: { type: "object", additionalProperties: true },
          items: { type: "array", items: { type: "object", additionalProperties: true } },
          total: { type: "integer" },
          skip: { type: "integer" },
          take: { type: "integer" },
        },
      },
      AccountRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "username", "password", "emailHost", "emailPort"],
        properties: {
          name: { type: "string", minLength: 1 },
          username: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 1, writeOnly: true },
          emailHost: { type: "string", minLength: 1 },
          emailPort: { type: "integer", minimum: 1, maximum: 65535 },
        },
      },
      AccountSummary: {
        type: "object",
        required: ["id", "name", "username", "emailHost", "emailPort", "createdAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          username: { type: "string" },
          emailHost: { type: "string" },
          emailPort: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      TemplateCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "subject", "content"],
        properties: {
          name: { type: "string", minLength: 1 },
          subject: { type: "string", minLength: 1 },
          content: { type: "string" },
          storageType: { type: "string", enum: ["LOCAL", "S3"], default: "LOCAL" },
        },
      },
      TemplateUpdateRequest: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1 },
          subject: { type: "string", minLength: 1 },
          content: { type: "string" },
        },
      },
      TemplateSummary: {
        type: "object",
        required: ["id", "name", "subject", "storageType", "createdAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          subject: { type: "string" },
          storageType: { type: "string", enum: ["LOCAL", "S3"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      BucketRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "path", "accessKeyId", "secretAccessKey", "region"],
        properties: {
          name: { type: "string", minLength: 1 },
          path: { type: "string", minLength: 1 },
          accessKeyId: { type: "string", minLength: 1, writeOnly: true },
          secretAccessKey: { type: "string", minLength: 1, writeOnly: true },
          region: { type: "string", minLength: 1 },
        },
      },
      BucketSummary: {
        type: "object",
        required: ["id", "name", "path", "region"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          path: { type: "string" },
          region: { type: "string" },
        },
      },
      LogsResponse: {
        type: "object",
        required: ["data", "total"],
        properties: {
          data: { type: "array", items: { type: "object", additionalProperties: true } },
          total: { type: "integer" },
        },
      },
    },
  },
} as const;
