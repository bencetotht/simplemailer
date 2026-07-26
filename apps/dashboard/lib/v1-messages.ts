import { createHash, randomUUID } from "crypto";
import { ArtifactFormat, Prisma, SenderStatus, Status } from "database";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalRequestDigest, isMateriallyDifferent } from "@/lib/idempotency";

const tagValue = z.string().max(256);
export const createInlineMessageSchema = z.object({
  sender: z.string().trim().min(1).max(128),
  to: z.string().email(),
  subject: z.string().trim().min(1).max(998),
  content: z.object({
    html: z.string().min(1).max(512 * 1024),
    text: z.string().max(512 * 1024).optional(),
  }).strict(),
  tags: z.record(tagValue).refine((tags) => Object.keys(tags).length <= 50, {
    message: "At most 50 tags are allowed",
  }).optional().default({}),
}).strict();

export type CreateInlineMessage = z.infer<typeof createInlineMessageSchema>;

export type AcceptMessageResult =
  | { kind: "accepted" | "replay"; message: MessageSummary }
  | { kind: "sender_not_found" }
  | { kind: "idempotency_conflict" };

export interface MessageSummary {
  id: string;
  status: Status;
  sender: string;
  to: string;
  subject: string;
  tags: Prisma.JsonValue;
  acceptedAt: Date;
  queuedAt: Date | null;
  completedAt: Date | null;
  failureClass: string | null;
  lastError: string | null;
}

function digestContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function artifactData(projectId: string, content: string, format: ArtifactFormat) {
  return {
    projectId_digest_format: {
      projectId,
      digest: digestContent(content),
      format,
    },
  };
}

function summarize(message: {
  id: string;
  status: Status;
  recipient: string;
  subject: string;
  tags: Prisma.JsonValue;
  acceptedAt: Date;
  queuedAt: Date | null;
  completedAt: Date | null;
  failureClass: string | null;
  lastError: string | null;
  sender: { alias: string };
}): MessageSummary {
  return {
    id: message.id,
    status: message.status,
    sender: message.sender.alias,
    to: message.recipient,
    subject: message.subject,
    tags: message.tags,
    acceptedAt: message.acceptedAt,
    queuedAt: message.queuedAt,
    completedAt: message.completedAt,
    failureClass: message.failureClass,
    lastError: message.lastError,
  };
}

const summaryInclude = { sender: { select: { alias: true } } } as const;

export async function acceptInlineMessage(input: {
  projectId: string;
  body: CreateInlineMessage;
  idempotencyKey: string | null;
  requestId: string;
  correlationId: string;
}): Promise<AcceptMessageResult> {
  const { projectId, body, idempotencyKey, requestId, correlationId } = input;
  const requestDigest = canonicalRequestDigest(body);

  if (idempotencyKey) {
    const existing = await prisma.message.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
      include: summaryInclude,
    });
    if (existing) {
      return isMateriallyDifferent(existing.requestDigest, requestDigest)
        ? { kind: "idempotency_conflict" }
        : { kind: "replay", message: summarize(existing) };
    }
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      const sender = await tx.sender.findFirst({
        where: {
          projectId,
          alias: body.sender,
          status: SenderStatus.ACTIVE,
          project: { status: "ACTIVE" },
        },
      });
      if (!sender) return null;

      const html = await tx.contentArtifact.upsert({
        where: artifactData(projectId, body.content.html, ArtifactFormat.HTML),
        create: {
          projectId,
          digest: digestContent(body.content.html),
          format: ArtifactFormat.HTML,
          byteLength: Buffer.byteLength(body.content.html),
          content: body.content.html,
        },
        update: {},
      });
      const text = body.content.text === undefined
        ? null
        : await tx.contentArtifact.upsert({
            where: artifactData(projectId, body.content.text, ArtifactFormat.TEXT),
            create: {
              projectId,
              digest: digestContent(body.content.text),
              format: ArtifactFormat.TEXT,
              byteLength: Buffer.byteLength(body.content.text),
              content: body.content.text,
            },
            update: {},
          });

      return tx.message.create({
        data: {
          id: `msg_${randomUUID().replaceAll("-", "")}`,
          projectId,
          senderId: sender.id,
          recipient: body.to,
          resolvedFrom: sender.displayName
            ? `${sender.displayName} <${sender.fromAddress}>`
            : sender.fromAddress,
          resolvedReplyTo: sender.replyTo,
          subject: body.subject,
          htmlArtifactId: html.id,
          textArtifactId: text?.id,
          tags: body.tags as Prisma.InputJsonValue,
          idempotencyKey,
          requestDigest,
          requestId,
          correlationId,
          status: Status.ENQUEUE_PENDING,
        },
        include: summaryInclude,
      });
    });
    if (!message) return { kind: "sender_not_found" };
    return { kind: "accepted", message: summarize(message) };
  } catch (error) {
    if (idempotencyKey && isUniqueConflict(error)) {
      const existing = await prisma.message.findUniqueOrThrow({
        where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
        include: summaryInclude,
      });
      return isMateriallyDifferent(existing.requestDigest, requestDigest)
        ? { kind: "idempotency_conflict" }
        : { kind: "replay", message: summarize(existing) };
    }
    throw error;
  }
}

function isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getProjectMessage(
  projectId: string,
  id: string,
): Promise<MessageSummary | null> {
  const message = await prisma.message.findFirst({
    where: { id, projectId, deletedAt: null },
    include: summaryInclude,
  });
  return message ? summarize(message) : null;
}
