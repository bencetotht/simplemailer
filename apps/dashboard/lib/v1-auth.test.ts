import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { generateApiKey } from "./api-keys";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { apiKey: { findUnique: mocks.findUnique, update: mocks.update } },
}));

import { requireProjectScope } from "./v1-auth";

function request(secret: string): NextRequest {
  return new NextRequest("http://localhost/v1/messages", {
    headers: { authorization: `Bearer ${secret}`, "x-request-id": "auth-test" },
  });
}

describe("project API authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
  });

  test("authenticates an active project key with the required scope", async () => {
    const generated = await generateApiKey();
    mocks.findUnique.mockResolvedValue({
      id: "key-1",
      projectId: "project-1",
      name: "application",
      prefix: generated.prefix,
      keyHash: generated.keyHash,
      scopes: ["messages:send"],
      expiresAt: null,
      revokedAt: null,
      project: { id: "project-1", slug: "app", status: "ACTIVE" },
    });

    const result = await requireProjectScope(request(generated.secret), "messages:send");

    expect(result).toMatchObject({
      ok: true,
      principal: { id: "key-1", projectId: "project-1" },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  test("rejects revoked credentials without updating last-used time", async () => {
    const generated = await generateApiKey();
    mocks.findUnique.mockResolvedValue({
      id: "key-1",
      projectId: "project-1",
      name: "revoked",
      prefix: generated.prefix,
      keyHash: generated.keyHash,
      scopes: ["messages:send"],
      expiresAt: null,
      revokedAt: new Date(),
      project: { id: "project-1", slug: "app", status: "ACTIVE" },
    });

    const result = await requireProjectScope(request(generated.secret), "messages:send");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("returns forbidden when a valid key lacks the requested scope", async () => {
    const generated = await generateApiKey();
    mocks.findUnique.mockResolvedValue({
      id: "key-1",
      projectId: "project-1",
      name: "send-only",
      prefix: generated.prefix,
      keyHash: generated.keyHash,
      scopes: ["messages:send"],
      expiresAt: null,
      revokedAt: null,
      project: { id: "project-1", slug: "app", status: "ACTIVE" },
    });

    const result = await requireProjectScope(request(generated.secret), "messages:read");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({ code: "INSUFFICIENT_SCOPE" });
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
