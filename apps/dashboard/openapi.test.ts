import Ajv2020 from "ajv/dist/2020";
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import checkedInSpec from "./openapi.json";
import { GET as healthCheck } from "./app/api/health/route";
import { apiError, jsonResponse } from "./lib/http";
import { LEGACY_STATUS_VALUES, openApiDocument } from "./lib/legacy-contract";
import { Status } from "database";

const ajv = new Ajv2020({ strict: false, formats: { email: true, "date-time": true } });

function responseSchema(path: keyof typeof openApiDocument.paths, method: string, status: string) {
  const operation = openApiDocument.paths[path][method as keyof (typeof openApiDocument.paths)[typeof path]];
  if (!operation || typeof operation !== "object" || !("responses" in operation)) {
    throw new Error(`Missing operation ${method} ${path}`);
  }
  const documented = (operation.responses as Record<string, {
    content?: { "application/json"?: { schema?: object } };
  }>)[status];
  const schema = documented?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`Missing JSON schema for ${status} ${method} ${path}`);
  if ("$ref" in schema && typeof schema.$ref === "string") {
    const name = schema.$ref.split("/").at(-1) as keyof typeof openApiDocument.components.schemas;
    return openApiDocument.components.schemas[name];
  }
  return schema;
}

describe("authoritative OpenAPI contract", () => {
  test("the checked-in artifact exactly matches the shared contract", () => {
    expect(checkedInSpec).toEqual(openApiDocument);
  });

  test("documents the complete legacy authentication and mail boundary", () => {
    expect(checkedInSpec.components.securitySchemes.LegacyApiKey).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "x-api-key",
    });
    expect(checkedInSpec.paths["/api/send"].post.responses["202"]).toBeDefined();
    expect(checkedInSpec.paths["/api/send"].post.responses["429"].headers["Retry-After"]).toBeDefined();
    expect(checkedInSpec.paths["/api/send"].post.responses["503"]).toBeDefined();
    expect(checkedInSpec.paths["/api/send"].get.parameters[0].name).toBe("enqueueKey");
    expect(checkedInSpec.paths["/api/send/bulk"]).toBeDefined();
    expect(checkedInSpec.paths["/api/send/bulk/{id}"]).toBeDefined();
    expect(checkedInSpec.components.schemas.SendAcceptedResponse.properties.status.enum)
      .toEqual(LEGACY_STATUS_VALUES);
    expect(LEGACY_STATUS_VALUES).toEqual(Object.values(Status));
    expect(LEGACY_STATUS_VALUES).toContain("DELIVERY_UNCERTAIN");
  });

  test("documents the scoped immutable message boundary", () => {
    expect(checkedInSpec.components.securitySchemes.ProjectBearerKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(checkedInSpec.paths["/v1/messages"].post.security)
      .toEqual([{ ProjectBearerKey: ["messages:send"] }]);
    expect(checkedInSpec.paths["/v1/messages/{id}"].get.security)
      .toEqual([{ ProjectBearerKey: ["messages:read"] }]);
    expect(checkedInSpec.paths["/v1/messages"].post.responses["202"]).toBeDefined();
    expect(checkedInSpec.paths["/v1/messages"].post.responses["409"]).toBeDefined();
    expect(checkedInSpec.paths["/v1/messages"].post.responses["503"]).toBeDefined();
  });

  test("validates a runtime health response against its schema", async () => {
    const response = healthCheck();
    const payload = await response.json();
    const validate = ajv.compile(responseSchema("/api/health", "get", "200"));
    expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
  });

  test("validates runtime success and error envelopes against representative schemas", async () => {
    const request = new NextRequest("http://localhost/api/send", {
      headers: { "x-request-id": "request-contract-test" },
    });
    const accepted = jsonResponse(
      request,
      { success: true, jobId: "job-1", status: "QUEUED" },
      { status: 202 },
    );
    const rejected = apiError(
      request,
      400,
      "VALIDATION_FAILED",
      "Request validation failed",
      { details: { recipient: ["Invalid email"] } },
    );

    const validateAccepted = ajv.compile(responseSchema("/api/send", "post", "202"));
    const validateRejected = ajv.compile(responseSchema("/api/send", "post", "400"));
    expect(validateAccepted(await accepted.json()), JSON.stringify(validateAccepted.errors)).toBe(true);
    expect(validateRejected(await rejected.json()), JSON.stringify(validateRejected.errors)).toBe(true);
  });
});
