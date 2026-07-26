import { NextRequest } from "next/server";
import { apiError, jsonResponse } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { rotateWebhookSecret } from "@/lib/webhooks";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProjectScope(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const result = await rotateWebhookSecret({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    id,
  });
  if (!result) {
    return apiError(request, 404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found");
  }
  return jsonResponse(request, {
    data: result.endpoint,
    secret: result.secret,
    previousSecretValidUntil: result.overlapUntil,
  });
}
