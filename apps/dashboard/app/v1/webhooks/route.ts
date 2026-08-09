import {
  createWebhookEndpointSchema,
} from "@bencetotht/simplemailer/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from "@/lib/webhooks";

export async function GET(request: NextRequest) {
  const auth = await requireProjectScope(request, "webhooks:read");
  if (!auth.ok) return auth.response;
  return jsonResponse(request, {
    data: await listWebhookEndpoints(auth.principal.projectId),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireProjectScope(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = createWebhookEndpointSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  try {
    const created = await createWebhookEndpoint({
      projectId: auth.principal.projectId,
      actorApiKeyId: auth.principal.id,
      ...parsed.data,
    });
    return jsonResponse(
      request,
      { data: created.endpoint, secret: created.secret },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Webhook URL")) {
      return apiError(request, 400, "UNSAFE_WEBHOOK_URL", error.message);
    }
    throw error;
  }
}
