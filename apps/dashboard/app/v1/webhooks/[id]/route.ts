import { updateWebhookEndpointSchema } from "@bencetotht/simplemailer/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { updateWebhookEndpoint } from "@/lib/webhooks";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProjectScope(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = updateWebhookEndpointSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  const { id } = await context.params;
  try {
    const endpoint = await updateWebhookEndpoint({
      projectId: auth.principal.projectId,
      actorApiKeyId: auth.principal.id,
      id,
      ...parsed.data,
    });
    if (!endpoint) {
      return apiError(request, 404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found");
    }
    return jsonResponse(request, { data: endpoint });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Webhook URL")) {
      return apiError(request, 400, "UNSAFE_WEBHOOK_URL", error.message);
    }
    throw error;
  }
}
