import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn().mockResolvedValue({
    ok: true,
    principal: { id: "key-actor", projectId: "project-1" },
  }),
  listProjectTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-templates", () => ({
  listProjectTemplates: mocks.listProjectTemplates,
}));

import { GET } from "./route";

describe("GET /v1/templates", () => {
  test("lists immutable template metadata for the authenticated project", async () => {
    const response = await GET(new NextRequest("http://localhost/v1/templates"));
    expect(response.status).toBe(200);
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "templates:read");
    expect(mocks.listProjectTemplates).toHaveBeenCalledWith("project-1");
  });
});
