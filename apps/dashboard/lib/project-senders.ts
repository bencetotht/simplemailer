import { randomUUID } from "node:crypto";
import type { UpsertSender } from "@bencetotht/simplemailer/contracts";
import { Prisma } from "database";
import { prisma } from "@/lib/db";

function summarize(sender: {
  alias: string;
  displayName: string;
  fromAddress: string;
  replyTo: string | null;
  status: "ACTIVE" | "DISABLED";
  maxConcurrency: number | null;
  maxPerMinute: number | null;
  updatedAt: Date;
}) {
  return sender;
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
      targetType: "sender",
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listProjectSenders(projectId: string) {
  const senders = await prisma.sender.findMany({
    where: { projectId },
    orderBy: { alias: "asc" },
    select: {
      alias: true,
      displayName: true,
      fromAddress: true,
      replyTo: true,
      status: true,
      maxConcurrency: true,
      maxPerMinute: true,
      updatedAt: true,
    },
  });
  return senders.map(summarize);
}

export type UpsertProjectSenderResult =
  | { kind: "upserted"; sender: ReturnType<typeof summarize> }
  | { kind: "credential_required" }
  | { kind: "credential_reference_missing"; environmentVariable: string }
  | { kind: "account_not_found" };

export async function upsertProjectSender(input: {
  projectId: string;
  actorApiKeyId: string;
  sender: UpsertSender;
}): Promise<UpsertProjectSenderResult> {
  const { projectId, actorApiKeyId, sender } = input;
  const existing = await prisma.sender.findUnique({
    where: { projectId_alias: { projectId, alias: sender.alias } },
    select: { id: true, accountId: true },
  });
  if (!existing && !sender.credential) return { kind: "credential_required" };

  let accountId = existing?.accountId;
  if (sender.credential) {
    const reference = process.env[sender.credential.env]?.trim();
    if (!reference) {
      return {
        kind: "credential_reference_missing",
        environmentVariable: sender.credential.env,
      };
    }
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: reference }, { username: reference }] },
      select: { id: true },
    });
    if (!account) return { kind: "account_not_found" };
    accountId = account.id;
  }
  if (!accountId) return { kind: "credential_required" };

  const upserted = await prisma.$transaction(async (tx) => {
    const value = await tx.sender.upsert({
      where: { projectId_alias: { projectId, alias: sender.alias } },
      create: {
        projectId,
        alias: sender.alias,
        displayName: sender.displayName,
        fromAddress: sender.fromAddress,
        replyTo: sender.replyTo ?? null,
        status: sender.status ?? "ACTIVE",
        maxConcurrency: sender.maxConcurrency ?? null,
        maxPerMinute: sender.maxPerMinute ?? null,
        accountId,
        verifiedAt: new Date(),
      },
      update: {
        displayName: sender.displayName,
        fromAddress: sender.fromAddress,
        replyTo: sender.replyTo ?? null,
        status: sender.status ?? "ACTIVE",
        maxConcurrency: sender.maxConcurrency ?? null,
        maxPerMinute: sender.maxPerMinute ?? null,
        accountId,
      },
      select: {
        id: true,
        alias: true,
        displayName: true,
        fromAddress: true,
        replyTo: true,
        status: true,
        maxConcurrency: true,
        maxPerMinute: true,
        updatedAt: true,
      },
    });
    await audit(tx, {
      projectId,
      actorApiKeyId,
      action: existing ? "sender.updated" : "sender.created",
      targetId: value.id,
      metadata: { alias: value.alias },
    });
    return value;
  });
  return { kind: "upserted", sender: summarize(upserted) };
}
