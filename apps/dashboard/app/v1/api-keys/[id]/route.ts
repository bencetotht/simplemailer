import { NextRequest } from "next/server";
import { apiError, jsonResponse } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { revokeProjectApiKey } from "@/lib/project-api-keys";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProjectScope(request, "keys:write");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const result = await revokeProjectApiKey({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    id,
  });
  if (result === "not_found") {
    return apiError(request, 404, "API_KEY_NOT_FOUND", "API key not found");
  }
  if (result === "self_revoke") {
    return apiError(
      request,
      409,
      "SELF_REVOCATION_REJECTED",
      "Create and verify a replacement key before revoking the current key",
    );
  }
  return jsonResponse(request, { data: { id, revoked: true } });
}
