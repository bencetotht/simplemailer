import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  upsertProjectTemplate: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-templates", () => ({
  upsertProjectTemplate: mocks.upsertProjectTemplate,
}));

import { PUT } from "./route";

const body = {
  name: "welcome",
  format: "HTML",
  source: "<p>Hello</p>",
  subject: "Welcome",
};

function request() {
  return new NextRequest("http://localhost/v1/templates/welcome", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /v1/templates/{name}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-actor", projectId: "project-1" },
    });
    mocks.upsertProjectTemplate.mockResolvedValue({
      name: "welcome",
      version: "tplv_1",
      digest: "digest",
      created: true,
    });
  });

  test("creates an immutable version through the project boundary", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ name: "welcome" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.upsertProjectTemplate).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-actor",
      template: body,
    });
  });

  test("rejects path/body name mismatches", async () => {
    const response = await PUT(request(), {
      params: Promise.resolve({ name: "other" }),
    });
    expect(response.status).toBe(409);
  });
});
