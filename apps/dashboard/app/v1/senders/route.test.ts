import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  listProjectSenders: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-senders", () => ({
  listProjectSenders: mocks.listProjectSenders,
}));

import { GET } from "./route";

describe("GET /v1/senders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-actor", projectId: "project-1" },
    });
  });

  test("lists sender aliases only within the authenticated project", async () => {
    mocks.listProjectSenders.mockResolvedValue([
      {
        alias: "transactional",
        displayName: "Example",
        fromAddress: "mail@example.com",
        replyTo: null,
        status: "ACTIVE",
        maxConcurrency: null,
        maxPerMinute: null,
        updatedAt: new Date("2026-07-29T12:00:00.000Z"),
      },
    ]);
    const response = await GET(new NextRequest("http://localhost/v1/senders"));
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "senders:read");
    expect(mocks.listProjectSenders).toHaveBeenCalledWith("project-1");
    await expect(response.json()).resolves.toMatchObject({
      data: [{ alias: "transactional", fromAddress: "mail@example.com" }],
    });
  });
});
