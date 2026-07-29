import { prisma } from 'database';
import type { Account, Log, Message, Template } from 'database';
import { Status } from 'database';
import { recordMessageWebhookEvent } from 'database/webhooks';
import type { MailJob } from './types';
import { ValueError } from './errors';
import { decryptSecret } from './secrets';

const MESSAGE_TERMINAL_STATUSES = [
  Status.SENT,
  Status.FAILED,
  Status.DEAD,
  Status.DELIVERY_UNCERTAIN,
] as const;

export async function createLog(
  data: MailJob,
  opts?: {
    enqueueKey?: string | null;
    correlationId?: string | null;
    bulkBatchId?: string | null;
    bulkItemId?: string | null;
    scheduledFor?: Date | null;
  },
): Promise<Log> {
  return prisma.log.create({
    data: {
      accountId: data.accountId,
      recipient: data.recipient,
      templateId: data.templateId,
      values: data.values as object,
      status: Status.PENDING,
      enqueueKey: opts?.enqueueKey ?? null,
      correlationId: opts?.correlationId ?? null,
      bulkBatchId: opts?.bulkBatchId ?? null,
      bulkItemId: opts?.bulkItemId ?? null,
      scheduledFor: opts?.scheduledFor ?? null,
    },
  });
}

export async function updateLogStatus(
  id: string,
  status: Status,
  opts?: {
    processingOwner?: string;
    retryCount?: number;
    lastError?: string | null;
    failureClass?: string | null;
    nextAttemptAt?: Date | null;
    lastAttemptAt?: Date | null;
  },
): Promise<Log> {
  const isTerminal =
    status === Status.SENT ||
    status === Status.FAILED ||
    status === Status.DEAD ||
    status === Status.DELIVERY_UNCERTAIN;
  const result = await prisma.log.updateMany({
    where: {
      id,
      ...(opts?.processingOwner ? { processingOwner: opts.processingOwner } : {}),
    },
    data: {
      status,
      ...(opts?.retryCount !== undefined && { retryCount: opts.retryCount }),
      ...(opts?.lastError !== undefined && { lastError: opts.lastError }),
      ...(opts?.failureClass !== undefined && { failureClass: opts.failureClass }),
      ...(opts?.nextAttemptAt !== undefined && { nextAttemptAt: opts.nextAttemptAt }),
      ...(opts?.lastAttemptAt !== undefined && { lastAttemptAt: opts.lastAttemptAt }),
      ...(isTerminal && { completedAt: new Date() }),
      processingOwner: null,
      processingLeaseExpiresAt: null,
    },
  });

  if (result.count === 0) {
    throw new ValueError(`Processing lease for log ${id} is no longer owned by this worker`);
  }
  const updatedLog = await prisma.log.findUniqueOrThrow({ where: { id } });

  if (isTerminal && updatedLog.bulkBatchId) {
    const remaining = await prisma.log.count({
      where: {
        bulkBatchId: updatedLog.bulkBatchId,
        status: {
          in: [Status.ENQUEUE_PENDING, Status.QUEUED, Status.PROCESSING, Status.RETRYING, Status.PENDING],
        },
      },
    });

    if (remaining === 0) {
      await prisma.bulkSendBatch.update({
        where: { id: updatedLog.bulkBatchId },
        data: { completedAt: new Date() },
      });
    }
  }

  return updatedLog;
}

export async function claimLogForProcessing(
  id: string,
  processingOwner: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  const result = await prisma.log.updateMany({
    where: {
      id,
      OR: [
        { status: { in: [Status.ENQUEUE_PENDING, Status.QUEUED, Status.RETRYING, Status.PENDING] } },
        {
          status: Status.PROCESSING,
          processingLeaseExpiresAt: { lte: now },
          deliveryAttemptStartedAt: null,
        },
      ],
    },
    data: {
      status: Status.PROCESSING,
      lastAttemptAt: now,
      processingOwner,
      processingLeaseExpiresAt: new Date(now.getTime() + leaseMs),
      deliveryAttemptStartedAt: null,
    },
  });
  return result.count > 0;
}

export async function markDeliveryAttemptStarted(
  id: string,
  processingOwner: string,
): Promise<boolean> {
  const result = await prisma.log.updateMany({
    where: {
      id,
      status: Status.PROCESSING,
      processingOwner,
      processingLeaseExpiresAt: { gt: new Date() },
    },
    data: { deliveryAttemptStartedAt: new Date() },
  });
  return result.count > 0;
}

export async function markDeliveryAttemptFailed(
  id: string,
  processingOwner: string,
): Promise<void> {
  await prisma.log.updateMany({
    where: { id, status: Status.PROCESSING, processingOwner },
    data: { deliveryAttemptStartedAt: null },
  });
}

export async function recoverExpiredProcessingLeases(): Promise<{
  requeued: number;
  uncertain: number;
}> {
  const now = new Date();
  const uncertain = await prisma.log.updateMany({
    where: {
      status: Status.PROCESSING,
      processingLeaseExpiresAt: { lte: now },
      deliveryAttemptStartedAt: { not: null },
    },
    data: {
      status: Status.DELIVERY_UNCERTAIN,
      completedAt: now,
      processingOwner: null,
      processingLeaseExpiresAt: null,
      failureClass: 'WORKER_LOST_DURING_SMTP_DELIVERY',
      lastError: 'Worker lease expired after SMTP delivery began; automatic retry suppressed',
    },
  });
  const requeued = await prisma.log.updateMany({
    where: {
      status: Status.PROCESSING,
      processingLeaseExpiresAt: { lte: now },
      deliveryAttemptStartedAt: null,
    },
    data: {
      status: Status.ENQUEUE_PENDING,
      processingOwner: null,
      processingLeaseExpiresAt: null,
      failureClass: 'PROCESSING_LEASE_EXPIRED',
      lastError: 'Worker lease expired before SMTP delivery began; job requeued',
    },
  });
  return { requeued: requeued.count, uncertain: uncertain.count };
}

export async function findLogById(id: string): Promise<Log | null> {
  return prisma.log.findUnique({ where: { id } });
}

type AccountCredentials = Pick<Account, 'username' | 'emailHost' | 'emailPort'> & { password: string };

export async function getCredentials(accountId: string): Promise<AccountCredentials> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      username: true,
      password: true,
      passwordEnc: true,
      emailHost: true,
      emailPort: true,
    },
  });
  if (!account) throw new ValueError(`Account ${accountId} not found`);

  const encrypted = account.passwordEnc ?? null;
  const legacy = account.password ?? null;
  let rawPassword: string | null = null;
  if (encrypted) {
    try {
      rawPassword = decryptSecret(encrypted);
    } catch {
      throw new ValueError(`Account ${accountId} password decryption failed`);
    }
  } else {
    rawPassword = legacy;
  }
  if (!rawPassword) {
    throw new ValueError(`Account ${accountId} has no password configured`);
  }

  return {
    username: account.username,
    password: rawPassword,
    emailHost: account.emailHost,
    emailPort: account.emailPort,
  };
}

export async function getImmutableMessage(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { accountId: true } },
      htmlArtifact: { select: { content: true } },
      textArtifact: { select: { content: true } },
    },
  });
  if (!message) throw new ValueError(`Message ${messageId} not found`);
  if (!message.htmlArtifact.content) {
    throw new ValueError(`Message ${messageId} HTML artifact content is unavailable`);
  }
  return {
    ...message,
    accountId: message.sender.accountId,
    html: message.htmlArtifact.content,
    text: message.textArtifact?.content ?? null,
  };
}

export async function claimMessageForProcessing(
  id: string,
  processingOwner: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const result = await tx.message.updateMany({
      where: {
        id,
        OR: [
          { status: { in: [Status.ENQUEUE_PENDING, Status.QUEUED, Status.RETRYING, Status.PENDING] } },
          {
            status: Status.PROCESSING,
            processingLeaseExpiresAt: { lte: now },
            deliveryAttemptStartedAt: null,
          },
        ],
      },
      data: {
        status: Status.PROCESSING,
        lastAttemptAt: now,
        processingOwner,
        processingLeaseExpiresAt: new Date(now.getTime() + leaseMs),
        deliveryAttemptStartedAt: null,
      },
    });
    if (result.count === 0) return false;
    const message = await tx.message.findUniqueOrThrow({ where: { id } });
    await recordMessageWebhookEvent(tx, message, now);
    return true;
  });
}

export async function markMessageDeliveryStarted(
  id: string,
  processingOwner: string,
): Promise<boolean> {
  const result = await prisma.message.updateMany({
    where: {
      id,
      status: Status.PROCESSING,
      processingOwner,
      processingLeaseExpiresAt: { gt: new Date() },
    },
    data: { deliveryAttemptStartedAt: new Date() },
  });
  return result.count > 0;
}

export async function markMessageDeliveryFailed(
  id: string,
  processingOwner: string,
): Promise<void> {
  await prisma.message.updateMany({
    where: { id, status: Status.PROCESSING, processingOwner },
    data: { deliveryAttemptStartedAt: null },
  });
}

export async function updateMessageStatus(
  id: string,
  status: Status,
  opts: {
    processingOwner: string;
    retryCount?: number;
    lastError?: string | null;
    failureClass?: string | null;
    nextAttemptAt?: Date | null;
    lastAttemptAt?: Date | null;
  },
) {
  const terminal = MESSAGE_TERMINAL_STATUSES.includes(status as typeof MESSAGE_TERMINAL_STATUSES[number]);
  await prisma.$transaction(async (tx) => {
    const occurredAt = new Date();
    const result = await tx.message.updateMany({
      where: { id, processingOwner: opts.processingOwner },
      data: {
        status,
        ...(opts.retryCount !== undefined && { retryCount: opts.retryCount }),
        ...(opts.lastError !== undefined && { lastError: opts.lastError }),
        ...(opts.failureClass !== undefined && { failureClass: opts.failureClass }),
        ...(opts.nextAttemptAt !== undefined && { nextAttemptAt: opts.nextAttemptAt }),
        ...(opts.lastAttemptAt !== undefined && { lastAttemptAt: opts.lastAttemptAt }),
        ...(terminal && { completedAt: occurredAt }),
        processingOwner: null,
        processingLeaseExpiresAt: null,
      },
    });
    if (result.count === 0) {
      throw new ValueError(`Processing lease for message ${id} is no longer owned by this worker`);
    }
    const message = await tx.message.findUniqueOrThrow({ where: { id } });
    await recordMessageWebhookEvent(tx, message, occurredAt);
  });
}

export async function getTemplate(templateId: string): Promise<Template> {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw new ValueError(`Template ${templateId} not found`);
  return template;
}

export async function validateAccount(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new ValueError(`Account ${accountId} not found`);
}

export async function validateTemplate(templateId: string): Promise<void> {
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) throw new ValueError(`Template ${templateId} not found`);
}

export async function claimDueEnqueuePending(limit = 50, olderThanMs = 10_000): Promise<Log[]> {
  const now = new Date();
  const threshold = new Date(Date.now() - olderThanMs);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Log[]>`
      SELECT *
      FROM "public"."Log"
      WHERE "status" = 'ENQUEUE_PENDING'::"public"."Status"
        AND (
          ("scheduledFor" IS NOT NULL AND "scheduledFor" <= ${now})
          OR ("scheduledFor" IS NULL AND "updatedAt" <= ${threshold})
        )
      ORDER BY COALESCE("scheduledFor", "createdAt") ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return [];
    await tx.log.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: Status.ENQUEUE_PENDING },
      data: { status: Status.PENDING },
    });
    return rows.map((row) => ({ ...row, status: Status.PENDING }));
  });
}

export async function releaseStaleEnqueueClaims(olderThanMs = 60_000): Promise<number> {
  const threshold = new Date(Date.now() - olderThanMs);
  const result = await prisma.log.updateMany({
    where: {
      status: Status.PENDING,
      updatedAt: { lte: threshold },
    },
    data: { status: Status.ENQUEUE_PENDING },
  });
  return result.count;
}

export async function markQueuedAfterPublish(logId: string): Promise<void> {
  await prisma.log.updateMany({
    where: {
      id: logId,
      status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] },
    },
    data: {
      status: Status.QUEUED,
      lastAttemptAt: new Date(),
      failureClass: null,
      lastError: null,
    },
  });
}

export async function releaseEnqueueClaim(
  logId: string,
  error: unknown,
): Promise<void> {
  await prisma.log.updateMany({
    where: { id: logId, status: Status.PENDING },
    data: {
      status: Status.ENQUEUE_PENDING,
      lastError: error instanceof Error ? error.message : String(error),
      failureClass: 'RECONCILE_PUBLISH_FAILED',
    },
  });
}

export async function claimDueMessages(limit = 50, olderThanMs = 10_000) {
  const threshold = new Date(Date.now() - olderThanMs);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Message[]>`
      SELECT *
      FROM "public"."Message"
      WHERE "status" = 'ENQUEUE_PENDING'::"public"."Status"
        AND "updatedAt" <= ${threshold}
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return [];
    await tx.message.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: Status.ENQUEUE_PENDING },
      data: { status: Status.PENDING },
    });
    return rows.map((row) => ({ ...row, status: Status.PENDING }));
  });
}

export async function releaseStaleMessageClaims(olderThanMs = 60_000): Promise<number> {
  const result = await prisma.message.updateMany({
    where: { status: Status.PENDING, updatedAt: { lte: new Date(Date.now() - olderThanMs) } },
    data: { status: Status.ENQUEUE_PENDING },
  });
  return result.count;
}

export async function markMessageQueuedAfterPublish(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const occurredAt = new Date();
    const result = await tx.message.updateMany({
      where: { id, status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] } },
      data: {
        status: Status.QUEUED,
        queuedAt: occurredAt,
        lastAttemptAt: occurredAt,
        failureClass: null,
        lastError: null,
      },
    });
    if (result.count === 0) return;
    const message = await tx.message.findUniqueOrThrow({ where: { id } });
    await recordMessageWebhookEvent(tx, message, occurredAt);
  });
}

export async function releaseMessageEnqueueClaim(id: string, error: unknown): Promise<void> {
  await prisma.message.updateMany({
    where: { id, status: Status.PENDING },
    data: {
      status: Status.ENQUEUE_PENDING,
      lastError: error instanceof Error ? error.message : String(error),
      failureClass: 'RECONCILE_PUBLISH_FAILED',
    },
  });
}

export async function recoverExpiredMessageLeases(): Promise<{
  requeued: number;
  uncertain: number;
}> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<Message[]>`
      SELECT *
      FROM "public"."Message"
      WHERE "status" = 'PROCESSING'::"public"."Status"
        AND "processingLeaseExpiresAt" <= ${now}
      FOR UPDATE SKIP LOCKED
    `;
    let requeued = 0;
    let uncertain = 0;
    for (const message of expired) {
      if (message.deliveryAttemptStartedAt) {
        const updated = await tx.message.update({
          where: { id: message.id },
          data: {
            status: Status.DELIVERY_UNCERTAIN,
            completedAt: now,
            processingOwner: null,
            processingLeaseExpiresAt: null,
            failureClass: 'WORKER_LOST_DURING_SMTP_DELIVERY',
            lastError: 'Worker lease expired after SMTP delivery began; automatic retry suppressed',
          },
        });
        await recordMessageWebhookEvent(tx, updated, now);
        uncertain += 1;
      } else {
        await tx.message.update({
          where: { id: message.id },
          data: {
            status: Status.ENQUEUE_PENDING,
            processingOwner: null,
            processingLeaseExpiresAt: null,
            failureClass: 'PROCESSING_LEASE_EXPIRED',
            lastError: 'Worker lease expired before SMTP delivery began; message requeued',
          },
        });
        requeued += 1;
      }
    }
    return { requeued, uncertain };
  });
}

export async function getMetrics(): Promise<{
  accounts: number;
  templates: number;
  sentMails: number;
  failedMails: number;
  pendingMails: number;
  retryingMails: number;
  queuedMails: number;
  processingMails: number;
  uncertainMails: number;
  activeWorkers: number;
  legacyPlaintextSecrets: number;
}> {
  const [accounts, templates, sentMails, failedMails, pendingMails, retryingMails, queuedMails, processingMails, uncertainMails, activeWorkers, plaintextAccounts, plaintextBuckets] =
    await Promise.all([
      prisma.account.count(),
      prisma.template.count(),
      prisma.log.count({ where: { status: Status.SENT } }),
      prisma.log.count({ where: { status: { in: [Status.FAILED, Status.DEAD] } } }),
      prisma.log.count({ where: { status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] } } }),
      prisma.log.count({ where: { status: Status.RETRYING } }),
      prisma.log.count({ where: { status: Status.QUEUED } }),
      prisma.log.count({ where: { status: Status.PROCESSING } }),
      prisma.log.count({ where: { status: Status.DELIVERY_UNCERTAIN } }),
      prisma.workerHeartbeat.count({
        where: { lastHeartbeat: { gte: new Date(Date.now() - 30_000) } },
      }),
      prisma.account.count({
        where: {
          password: { not: null },
          OR: [{ passwordEnc: null }, { passwordEnc: '' }],
        },
      }),
      prisma.bucket.count({
        where: {
          OR: [
            {
              accessKeyId: { not: null },
              AND: [{ OR: [{ accessKeyIdEnc: null }, { accessKeyIdEnc: '' }] }],
            },
            {
              secretAccessKey: { not: null },
              AND: [{ OR: [{ secretAccessKeyEnc: null }, { secretAccessKeyEnc: '' }] }],
            },
          ],
        },
      }),
    ]);

  return {
    accounts,
    templates,
    sentMails,
    failedMails,
    pendingMails,
    retryingMails,
    queuedMails,
    processingMails,
    uncertainMails,
    activeWorkers,
    legacyPlaintextSecrets: plaintextAccounts + plaintextBuckets,
  };
}
