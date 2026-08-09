import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/http";
import { requireProjectScope } from "@/lib/v1-auth";
import { listProjectSenders } from "@/lib/project-senders";

export async function GET(request: NextRequest) {
  const auth = await requireProjectScope(request, "senders:read");
  if (!auth.ok) return auth.response;
  return jsonResponse(request, {
    data: await listProjectSenders(auth.principal.projectId),
  });
}
