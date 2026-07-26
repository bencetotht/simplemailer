import { NextRequest } from "next/server";
import { requireProjectScope } from "@/lib/v1-auth";
import { acceptInlineMessage, createInlineMessageSchema } from "@/lib/v1-messages";
import { publishMessageRecord } from "@/lib/v1-send-jobs";
import { apiError, getRequestMetadata, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/legacy-contract";

export async function POST(request: NextRequest) {
  const auth = await requireProjectScope(request, "messages:send");
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, JSON_LIMITS.send);
  if (!body.ok) return body.response;
  const parsed = createInlineMessageSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return apiError(
      request,
      400,
      "INVALID_IDEMPOTENCY_KEY",
      `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    );
  }

  const { requestId, correlationId } = getRequestMetadata(request);
  const result = await acceptInlineMessage({
    projectId: auth.principal.projectId,
    body: parsed.data,
    idempotencyKey,
    requestId,
    correlationId,
  });
  if (result.kind === "sender_not_found") {
    return apiError(request, 404, "SENDER_NOT_FOUND", "Active sender alias not found");
  }
  if (result.kind === "idempotency_conflict") {
    return apiError(
      request,
      409,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used with a different request",
    );
  }

  if (result.kind === "accepted") {
    const queued = await publishMessageRecord({
      id: result.message.id,
      correlationId,
      requestId,
      idempotencyKey,
    });
    if (!queued) {
      return apiError(
        request,
        503,
        "ENQUEUE_FAILED",
        "Message was accepted but could not be queued; retry with the same Idempotency-Key",
        { compatibilityFields: { messageId: result.message.id } },
      );
    }
    result.message.status = "QUEUED";
    result.message.queuedAt = new Date();
  }

  return jsonResponse(request, { data: result.message }, { status: 202 });
}
