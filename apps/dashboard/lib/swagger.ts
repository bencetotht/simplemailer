import { createSwaggerSpec } from "next-swagger-doc";

export function getApiDocs() {
  return createSwaggerSpec({
    apiFolder: "app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "SimpleMailer API",
        version: "2.0.0",
        description:
          "REST API for the SimpleMailer dashboard. Exposes SMTP account management, template management, S3 bucket configuration, job queue inspection, and mail dispatch.",
      },
      tags: [
        { name: "System", description: "Health and status endpoints" },
        { name: "Mail", description: "Queue mail jobs" },
        { name: "Jobs", description: "Inspect the RabbitMQ mailer queue" },
        { name: "Logs", description: "Delivery log records" },
        { name: "Accounts", description: "SMTP account management" },
        { name: "Buckets", description: "S3 bucket configuration" },
        { name: "Templates", description: "Email template management" },
      ],
      components: {
        schemas: {
          HealthResponse: {
            type: "object",
            properties: {
              status: { type: "string", example: "ok" },
              message: {
                type: "string",
                example: "SimpleMailer dashboard API is running",
              },
              version: { type: "string", example: "2.0.0" },
            },
          },
          MailJobRequest: {
            type: "object",
            required: ["accountId", "templateId", "recipient", "values"],
            properties: {
              accountId: {
                type: "string",
                description: "ID of the SMTP account to send from",
              },
              templateId: {
                type: "string",
                description: "ID of the template to render",
              },
              recipient: {
                type: "string",
                description: "Recipient email address",
                example: "user@example.com",
              },
              values: {
                type: "object",
                additionalProperties: true,
                description: "Template variable substitutions",
                example: { name: "Alice", confirmUrl: "https://example.com/confirm" },
              },
            },
          },
          AccountRequest: {
            type: "object",
            required: ["name", "username", "password", "emailHost", "emailPort"],
            properties: {
              name: { type: "string", example: "Primary SMTP" },
              username: { type: "string", example: "noreply@example.com" },
              password: { type: "string", example: "app-password-here" },
              emailHost: { type: "string", example: "smtp.example.com" },
              emailPort: { type: "integer", example: 587 },
            },
          },
          AccountSummary: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              username: { type: "string" },
            },
          },
          AccountDetail: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              username: { type: "string" },
              emailHost: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          BucketRequest: {
            type: "object",
            required: ["name", "path", "accessKeyId", "secretAccessKey", "region"],
            properties: {
              name: { type: "string", example: "my-templates-bucket" },
              path: { type: "string", example: "templates/" },
              accessKeyId: { type: "string", example: "AKIAIOSFODNN7EXAMPLE" },
              secretAccessKey: { type: "string", example: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
              region: { type: "string", example: "us-east-1" },
            },
          },
          BucketSummary: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              path: { type: "string" },
              region: { type: "string" },
            },
          },
          TemplateSummary: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
          LogEntry: {
            type: "object",
            properties: {
              id: { type: "string" },
              recipient: { type: "string" },
              status: {
                type: "string",
                enum: ["PENDING", "SENT", "FAILED", "RETRYING"],
              },
              createdAt: { type: "string", format: "date-time" },
              account: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
              },
              template: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
          SuccessResponse: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string", description: "ID of the created resource on success, error detail on failure" },
            },
          },
          ValidationError: {
            type: "object",
            properties: {
              error: { type: "string", example: "Validation failed" },
              fields: {
                type: "object",
                additionalProperties: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  });
}
