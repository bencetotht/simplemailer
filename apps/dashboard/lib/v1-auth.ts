import type { ApiKey, Project } from "database";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/http";
import { apiKeyPrefix, verifyApiKey } from "@/lib/api-keys";

export type ProjectPrincipal = Pick<ApiKey, "id" | "projectId" | "name" | "scopes"> & {
  project: Pick<Project, "id" | "slug" | "status">;
};

export type ProjectAuthResult =
  | { ok: true; principal: ProjectPrincipal }
  | { ok: false; response: ReturnType<typeof apiError> };

export async function requireProjectScope(
  request: NextRequest,
  requiredScope: string,
): Promise<ProjectAuthResult> {
  const authorization = request.headers.get("authorization");
  const secret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const prefix = apiKeyPrefix(secret);
  if (!prefix) {
    return {
      ok: false,
      response: apiError(request, 401, "INVALID_API_KEY", "A valid Bearer credential is required"),
    };
  }

  const key = await prisma.apiKey.findUnique({
    where: { prefix },
    include: { project: { select: { id: true, slug: true, status: true } } },
  });
  const now = new Date();
  if (
    !key ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= now) ||
    key.project.status !== "ACTIVE" ||
    !(await verifyApiKey(secret, key.keyHash))
  ) {
    return {
      ok: false,
      response: apiError(request, 401, "INVALID_API_KEY", "API key is invalid or inactive"),
    };
  }

  if (!key.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiError(
        request,
        403,
        "INSUFFICIENT_SCOPE",
        `API key requires the ${requiredScope} scope`,
      ),
    };
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: now },
  });
  return {
    ok: true,
    principal: {
      id: key.id,
      projectId: key.projectId,
      name: key.name,
      scopes: key.scopes,
      project: key.project,
    },
  };
}
