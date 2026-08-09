import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  listProjectApiKeys: vi.fn(),
  createProjectApiKey: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-api-keys", () => ({
  listProjectApiKeys: mocks.listProjectApiKeys,
  createProjectApiKey: mocks.createProjectApiKey,
}));

import { GET, POST } from "./route";

function request(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("http://localhost/v1/api-keys", {
    method,
    headers: {
      authorization: "Bearer test",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/v1/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-actor", projectId: "project-1" },
    });
  });

  test("lists only key metadata for the authenticated project", async () => {
    mocks.listProjectApiKeys.mockResolvedValue([
      {
        id: "key-1",
        name: "application",
        prefix: "0123456789abcdef",
        scopes: ["messages:send"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date("2026-07-29T12:00:00.000Z"),
      },
    ]);

    const response = await GET(request("GET"));

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "keys:read");
    expect(mocks.listProjectApiKeys).toHaveBeenCalledWith("project-1");
    await expect(response.json()).resolves.toMatchObject({
      data: [{ name: "application", prefix: "0123456789abcdef" }],
    });
  });

  test("creates a scoped key and returns its secret once", async () => {
    mocks.createProjectApiKey.mockResolvedValue({
      key: {
        id: "key-2",
        name: "worker",
        prefix: "fedcba9876543210",
        scopes: ["messages:send"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date("2026-07-29T12:00:00.000Z"),
      },
      secret: "sm_live_fedcba9876543210.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    const response = await POST(request("POST", {
      name: "worker",
      scopes: ["messages:send"],
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "keys:write");
    expect(mocks.createProjectApiKey).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-actor",
      name: "worker",
      scopes: ["messages:send"],
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { id: "key-2" },
      secret: expect.stringMatching(/^sm_live_/),
    });
  });

  test("rejects unknown scopes and past expiration", async () => {
    const unknownScope = await POST(request("POST", {
      name: "worker",
      scopes: ["admin:everything"],
    }));
    expect(unknownScope.status).toBe(400);

    const expired = await POST(request("POST", {
      name: "worker",
      scopes: ["messages:send"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    }));
    expect(expired.status).toBe(400);
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();
  });
});
