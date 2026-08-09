import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  revokeProjectApiKey: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/project-api-keys", () => ({
  revokeProjectApiKey: mocks.revokeProjectApiKey,
}));

import { DELETE } from "./route";

const request = new NextRequest("http://localhost/v1/api-keys/key-2", {
  method: "DELETE",
  headers: { authorization: "Bearer test" },
});
const context = { params: Promise.resolve({ id: "key-2" }) };

describe("DELETE /v1/api-keys/{id}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { id: "key-actor", projectId: "project-1" },
    });
  });

  test("revokes a different project key", async () => {
    mocks.revokeProjectApiKey.mockResolvedValue("revoked");
    const response = await DELETE(request, context);
    expect(response.status).toBe(200);
    expect(mocks.revokeProjectApiKey).toHaveBeenCalledWith({
      projectId: "project-1",
      actorApiKeyId: "key-actor",
      id: "key-2",
    });
  });

  test("prevents accidental self-revocation", async () => {
    mocks.revokeProjectApiKey.mockResolvedValue("self_revoke");
    const response = await DELETE(request, context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SELF_REVOCATION_REJECTED",
    });
  });
});
