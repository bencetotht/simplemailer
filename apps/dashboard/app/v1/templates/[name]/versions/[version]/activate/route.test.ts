import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn().mockResolvedValue({
    ok: true,
    principal: { id: "key-actor", projectId: "project-1" },
  }),
  activateProjectTemplateVersion: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-templates", () => ({
  activateProjectTemplateVersion: mocks.activateProjectTemplateVersion,
}));

import { POST } from "./route";

const request = new NextRequest(
  "http://localhost/v1/templates/welcome/versions/tplv_1/activate",
  { method: "POST" },
);
const context = {
  params: Promise.resolve({ name: "welcome", version: "tplv_1" }),
};

describe("POST /v1/templates/{name}/versions/{version}/activate", () => {
  test("activates a version owned by the authenticated project", async () => {
    mocks.activateProjectTemplateVersion.mockResolvedValue(true);
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(mocks.activateProjectTemplateVersion).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-actor",
      name: "welcome",
      version: "tplv_1",
    });
  });

  test("does not reveal versions from another project", async () => {
    mocks.activateProjectTemplateVersion.mockResolvedValue(false);
    const response = await POST(request, context);
    expect(response.status).toBe(404);
  });
});
