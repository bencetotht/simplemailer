import { upsertSenderSchema } from "@simplemailer/sdk/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { upsertProjectSender } from "@/lib/project-senders";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ alias: string }> },
) {
  const auth = await requireProjectScope(request, "senders:write");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = upsertSenderSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  const { alias } = await context.params;
  if (parsed.data.alias !== alias) {
    return apiError(
      request,
      409,
      "SENDER_ALIAS_MISMATCH",
      "Sender alias in the path and request body must match",
    );
  }

  const result = await upsertProjectSender({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    sender: parsed.data,
  });
  if (result.kind === "credential_required") {
    return apiError(
      request,
      400,
      "CREDENTIAL_REFERENCE_REQUIRED",
      "Creating a sender requires a credential environment reference",
    );
  }
  if (result.kind === "credential_reference_missing") {
    return apiError(
      request,
      422,
      "CREDENTIAL_REFERENCE_UNAVAILABLE",
      `Server environment variable ${result.environmentVariable} is not configured`,
    );
  }
  if (result.kind === "account_not_found") {
    return apiError(
      request,
      404,
      "DELIVERY_ACCOUNT_NOT_FOUND",
      "The referenced delivery account does not exist",
    );
  }
  return jsonResponse(request, { data: result.sender });
}
