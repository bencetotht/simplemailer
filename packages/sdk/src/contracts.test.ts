import { describe, expect, test } from "vitest";
import {
  createInlineMessageSchema,
  mailerManifestSchema,
  publicJsonSchemas,
} from "./contracts.js";

describe("public contracts", () => {
  test("normalizes omitted tags", () => {
    expect(
      createInlineMessageSchema.parse({
        sender: "transactional",
        to: "person@example.com",
        subject: "Hello",
        content: { html: "<p>Hello</p>" },
      }).tags,
    ).toEqual({});
  });

  test("rejects duplicate declarative aliases", () => {
    const result = mailerManifestSchema.safeParse({
      apiVersion: "simplemailer/v1",
      senders: [
        { alias: "main", displayName: "One", fromAddress: "one@example.com" },
        { alias: "main", displayName: "Two", fromAddress: "two@example.com" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("exports OpenAPI-compatible schemas from runtime validators", () => {
    expect(publicJsonSchemas.CreateInlineMessageRequest).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["sender", "to", "subject", "content"]),
    });
  });
});
