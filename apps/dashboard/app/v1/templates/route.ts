import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { listProjectTemplates } from "@/lib/project-templates";

export async function GET(request: NextRequest) {
  const auth = await requireProjectScope(request, "templates:read");
  if (!auth.ok) return auth.response;
  return jsonResponse(request, {
    data: await listProjectTemplates(auth.principal.projectId),
  });
}
