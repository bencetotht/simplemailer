import { NextRequest } from "next/server";
import { requireProjectScope } from "@/lib/v1-auth";
import { getProjectMessage } from "@/lib/v1-messages";
import { apiError, jsonResponse } from "@/lib/http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProjectScope(request, "messages:read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const message = await getProjectMessage(auth.principal.projectId, id);
  if (!message) return apiError(request, 404, "MESSAGE_NOT_FOUND", "Message not found");
  return jsonResponse(request, { data: message });
}
