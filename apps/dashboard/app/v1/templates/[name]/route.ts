import { upsertTemplateSchema } from "@simplemailer/sdk/contracts";
import { NextRequest } from "next/server";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { upsertProjectTemplate } from "@/lib/project-templates";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const auth = await requireProjectScope(request, "templates:write");
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = upsertTemplateSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(request, 400, "VALIDATION_FAILED", "Request validation failed", {
      details: parsed.error.flatten(),
    });
  }
  const { name } = await context.params;
  if (parsed.data.name !== name) {
    return apiError(
      request,
      409,
      "TEMPLATE_NAME_MISMATCH",
      "Template name in the path and request body must match",
    );
  }
  const result = await upsertProjectTemplate({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    template: parsed.data,
  });
  return jsonResponse(request, { data: result });
}
