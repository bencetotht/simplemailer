import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  listWebhookEndpoints: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/webhooks", () => ({
  createWebhookEndpoint: mocks.createWebhookEndpoint,
  listWebhookEndpoints: mocks.listWebhookEndpoints,
}));

import { POST } from "./route";

describe("POST /v1/webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-1", projectId: "project-1" },
    });
    mocks.createWebhookEndpoint.mockResolvedValue({
      endpoint: {
        id: "whe_1",
        url: "https://hooks.example.com/simplemailer",
        events: ["message.sent"],
        status: "ACTIVE",
      },
      secret: "whsec_once",
    });
  });

  test("requires project write scope and returns the secret once", async () => {
    const request = new NextRequest("http://localhost/v1/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        url: "https://hooks.example.com/simplemailer",
        events: ["message.sent"],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      expect.anything(),
      "webhooks:write",
    );
    expect(mocks.createWebhookEndpoint).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-1",
      url: "https://hooks.example.com/simplemailer",
      events: ["message.sent"],
    });
    await expect(response.json()).resolves.toMatchObject({ secret: "whsec_once" });
  });

  test("rejects unknown event subscriptions before persistence", async () => {
    const request = new NextRequest("http://localhost/v1/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        url: "https://hooks.example.com/simplemailer",
        events: ["message.opened"],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
  });
});
