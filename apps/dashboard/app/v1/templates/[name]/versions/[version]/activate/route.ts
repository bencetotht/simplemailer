import { NextRequest } from "next/server";
import { apiError, jsonResponse } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { activateProjectTemplateVersion } from "@/lib/project-templates";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string; version: string }> },
) {
  const auth = await requireProjectScope(request, "templates:write");
  if (!auth.ok) return auth.response;
  const { name, version } = await context.params;
  const activated = await activateProjectTemplateVersion({
    projectId: auth.principal.projectId,
    actorApiKeyId: auth.principal.id,
    name,
    version,
  });
  if (!activated) {
    return apiError(
      request,
      404,
      "TEMPLATE_VERSION_NOT_FOUND",
      "Managed template version not found",
    );
  }
  return jsonResponse(request, { data: { name, version, active: true } });
}
