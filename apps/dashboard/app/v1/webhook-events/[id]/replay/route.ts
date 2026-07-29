import { replayWebhookEventSchema } from "@simplemailer/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { replayWebhookEvent } from "@/lib/webhooks";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProjectScope(request, "webhooks:replay");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = replayWebhookEventSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  const { id } = await context.params;
  const result = await replayWebhookEvent({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    eventId: id,
    endpointId: parsed.data.endpointId,
  });
  if (!result) {
    return apiError(
      request,
      404,
      "WEBHOOK_REPLAY_TARGET_NOT_FOUND",
      "Webhook event or endpoint not found",
    );
  }
  return jsonResponse(request, { data: result }, { status: 202 });
}
