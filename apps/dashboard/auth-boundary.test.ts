import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { POST as createAccount } from "./app/api/account/route";
import { DELETE as deleteAccount } from "./app/api/account/[id]/route";
import { POST as createBucket } from "./app/api/bucket/route";
import { DELETE as deleteBucket } from "./app/api/bucket/[id]/route";
import { POST as send } from "./app/api/send/route";
import { POST as sendBulk } from "./app/api/send/bulk/route";
import { POST as createTemplate } from "./app/api/template/route";
import {
  DELETE as deleteTemplate,
  PATCH as updateTemplate,
} from "./app/api/template/[id]/route";

const originalApiKey = process.env.DASHBOARD_API_KEY;

function request(method: string): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": "wrong-key",
    },
    body: ["POST", "PATCH", "PUT"].includes(method) ? "{}" : undefined,
  });
}

describe("legacy protected mutation authentication", () => {
  beforeEach(() => {
    process.env.DASHBOARD_API_KEY = "expected-test-key";
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.DASHBOARD_API_KEY;
    else process.env.DASHBOARD_API_KEY = originalApiKey;
  });

  test.each([
    ["POST /api/account", () => createAccount(request("POST"))],
    ["DELETE /api/account/{id}", () => deleteAccount(request("DELETE"), { params: Promise.resolve({ id: "id" }) })],
    ["POST /api/bucket", () => createBucket(request("POST"))],
    ["DELETE /api/bucket/{id}", () => deleteBucket(request("DELETE"), { params: Promise.resolve({ id: "id" }) })],
    ["POST /api/send", () => send(request("POST"))],
    ["POST /api/send/bulk", () => sendBulk(request("POST"))],
    ["POST /api/template", () => createTemplate(request("POST"))],
    ["PATCH /api/template/{id}", () => updateTemplate(request("PATCH"), { params: Promise.resolve({ id: "id" }) })],
    ["DELETE /api/template/{id}", () => deleteTemplate(request("DELETE"), { params: Promise.resolve({ id: "id" }) })],
  ])("%s fails before performing the mutation", async (_name, invoke) => {
    const response = await invoke();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "INVALID_API_KEY",
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });
});
