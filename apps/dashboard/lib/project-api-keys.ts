import { randomUUID } from "node:crypto";
import type { ApiKeyScope } from "@bencetotht/simplemailer/contracts";
import { Prisma } from "database";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/api-keys";

function summarize(key: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes as ApiKeyScope[],
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

async function audit(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    actorApiKeyId: string;
    action: string;
    targetId: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.auditEvent.create({
    data: {
      id: `aud_${randomUUID().replaceAll("-", "")}`,
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: input.action,
      targetType: "api_key",
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listProjectApiKeys(projectId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return keys.map(summarize);
}

export async function createProjectApiKey(input: {
  projectId: string;
  actorApiKeyId: string;
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}) {
  const generated = await generateApiKey();
  const key = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "api_key.created",
      targetId: created.id,
      metadata: { name: created.name, scopes: created.scopes },
    });
    return created;
  });
  return { key: summarize(key), secret: generated.secret };
}

export async function revokeProjectApiKey(input: {
  projectId: string;
  actorApiKeyId: string;
  id: string;
}) {
  return prisma.$transaction(async (tx) => {
    const key = await tx.apiKey.findFirst({
      where: { id: input.id, projectId: input.projectId },
    });
    if (!key) return "not_found" as const;
    if (key.id === input.actorApiKeyId) return "self_revoke" as const;
    if (key.revokedAt) return "revoked" as const;

    const revokedAt = new Date();
    await tx.apiKey.update({
      where: { id: key.id },
      data: { revokedAt },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "api_key.revoked",
      targetId: key.id,
      metadata: { name: key.name, prefix: key.prefix },
    });
    return "revoked" as const;
  });
}
