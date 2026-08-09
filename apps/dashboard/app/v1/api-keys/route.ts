import { createApiKeySchema } from "@simplemailer/sdk/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import {
  createProjectApiKey,
  listProjectApiKeys,
} from "@/lib/project-api-keys";

export async function GET(request: NextRequest) {
  const auth = await requireProjectScope(request, "keys:read");
  if (!auth.ok) return auth.response;
  return jsonResponse(request, {
    data: await listProjectApiKeys(auth.principal.projectId),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireProjectScope(request, "keys:write");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = createApiKeySchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  if (parsed.data.expiresAt && new Date(parsed.data.expiresAt) <= new Date()) {
    return apiError(
      request,
      400,
      "INVALID_EXPIRY",
      "API key expiry must be in the future",
    );
  }
  const created = await createProjectApiKey({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    ...parsed.data,
  });
  return jsonResponse(
    request,
    { data: created.key, secret: created.secret },
    { status: 201 },
  );
}
