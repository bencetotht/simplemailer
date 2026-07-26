import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { JSON_LIMITS, readJsonBody } from "./http";

function jsonRequest(body: string, contentLength?: number): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(contentLength === undefined ? {} : { "content-length": String(contentLength) }),
    },
    body,
  });
}

describe("bounded JSON request parsing", () => {
  test("returns a stable malformed JSON envelope", async () => {
    const result = await readJsonBody(jsonRequest("{"), JSON_LIMITS.controlPlane);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toMatchObject({
      success: false,
      code: "MALFORMED_JSON",
      message: "Request body must be valid JSON",
      requestId: expect.any(String),
    });
  });

  test("rejects declared and streamed bodies above the route limit", async () => {
    const declared = await readJsonBody(jsonRequest("{}", 10_000), 100);
    expect(declared.ok).toBe(false);
    if (!declared.ok) expect(declared.response.status).toBe(413);

    const streamed = await readJsonBody(jsonRequest(JSON.stringify({ value: "x".repeat(200) })), 100);
    expect(streamed.ok).toBe(false);
    if (!streamed.ok) expect(streamed.response.status).toBe(413);
  });
});
