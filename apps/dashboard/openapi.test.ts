import { describe, expect, test } from "bun:test";
import spec from "./openapi.json";

describe("OpenAPI bulk send coverage", () => {
  test("includes bulk send paths", () => {
    expect(spec.paths["/api/send/bulk"]).toBeDefined();
    expect(spec.paths["/api/send/bulk/{id}"]).toBeDefined();
  });

  test("includes bulk send schemas", () => {
    expect(spec.components.schemas.BulkSendRequest).toBeDefined();
    expect(spec.components.schemas.BulkSendAcceptedResponse).toBeDefined();
    expect(spec.components.schemas.BulkSendBatchResponse).toBeDefined();
    expect(spec.components.schemas.BulkSendItem).toBeDefined();
  });
});
