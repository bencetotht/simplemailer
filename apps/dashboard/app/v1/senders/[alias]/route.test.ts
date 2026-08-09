import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  upsertProjectSender: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-senders", () => ({
  upsertProjectSender: mocks.upsertProjectSender,
}));

import { PUT } from "./route";

const body = {
  alias: "transactional",
  displayName: "Example",
  fromAddress: "mail@example.com",
  credential: { env: "SIMPLEMAILER_ACCOUNT_REFERENCE" },
};

function request(value: unknown = body) {
  return new NextRequest("http://localhost/v1/senders/transactional", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("PUT /v1/senders/{alias}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-actor", projectId: "project-1" },
    });
    mocks.upsertProjectSender.mockResolvedValue({
      kind: "upserted",
      sender: {
        alias: body.alias,
        displayName: body.displayName,
        fromAddress: body.fromAddress,
        replyTo: null,
        status: "ACTIVE",
        maxConcurrency: null,
        maxPerMinute: null,
        updatedAt: new Date("2026-07-29T12:00:00.000Z"),
      },
    });
  });

  test("upserts an alias through a server-side credential reference", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ alias: "transactional" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.upsertProjectSender).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-actor",
      sender: body,
    });
  });

  test("rejects path/body alias mismatches", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ alias: "marketing" }),
    });
    expect(response.status).toBe(409);
    expect(mocks.upsertProjectSender).not.toHaveBeenCalled();
  });

  test("reports a missing server credential reference without exposing secrets", async () => {
    mocks.upsertProjectSender.mockResolvedValue({
      kind: "credential_reference_missing",
      environmentVariable: "SIMPLEMAILER_ACCOUNT_REFERENCE",
    });
    const response = await PUT(request(), {
      params: Promise.resolve({ alias: "transactional" }),
    });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "CREDENTIAL_REFERENCE_UNAVAILABLE",
    });
  });
});
