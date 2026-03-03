import { prisma } from 'database';
import type { Account, Log, Template } from 'database';
import { Status } from 'database';
import type { MailJob } from './types';
import { ValueError } from './errors';
import { decryptSecret } from './secrets';

export async function createLog(
  data: MailJob,
  opts?: { enqueueKey?: string | null; correlationId?: string | null },
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
    },
  });
}

export async function updateLogStatus(
  id: string,
  status: Status,
  opts?: {
    retryCount?: number;
    lastError?: string | null;
    failureClass?: string | null;
    nextAttemptAt?: Date | null;
    lastAttemptAt?: Date | null;
  },
): Promise<Log> {
  const isTerminal = status === Status.SENT || status === Status.FAILED || status === Status.DEAD;
  return prisma.log.update({
    where: { id },
    data: {
      status,
      ...(opts?.retryCount !== undefined && { retryCount: opts.retryCount }),
      ...(opts?.lastError !== undefined && { lastError: opts.lastError }),
      ...(opts?.failureClass !== undefined && { failureClass: opts.failureClass }),
      ...(opts?.nextAttemptAt !== undefined && { nextAttemptAt: opts.nextAttemptAt }),
      ...(opts?.lastAttemptAt !== undefined && { lastAttemptAt: opts.lastAttemptAt }),
      ...(isTerminal && { completedAt: new Date() }),
    },
  });
}

export async function claimLogForProcessing(id: string): Promise<boolean> {
  const result = await prisma.log.updateMany({
    where: {
      id,
      status: { in: [Status.ENQUEUE_PENDING, Status.QUEUED, Status.RETRYING, Status.PENDING] },
    },
    data: {
      status: Status.PROCESSING,
      lastAttemptAt: new Date(),
    },
  });
  return result.count > 0;
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

export async function fetchStaleEnqueuePending(limit = 100, olderThanMs = 10_000): Promise<Log[]> {
  const threshold = new Date(Date.now() - olderThanMs);
  return prisma.log.findMany({
    where: {
      status: Status.ENQUEUE_PENDING,
      updatedAt: { lte: threshold },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function markQueuedAfterPublish(logId: string): Promise<void> {
  await prisma.log.update({
    where: { id: logId },
    data: {
      status: Status.QUEUED,
      lastAttemptAt: new Date(),
      failureClass: null,
      lastError: null,
    },
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
  activeWorkers: number;
  legacyPlaintextSecrets: number;
}> {
  const [accounts, templates, sentMails, failedMails, pendingMails, retryingMails, queuedMails, processingMails, activeWorkers, plaintextAccounts, plaintextBuckets] =
    await Promise.all([
      prisma.account.count(),
      prisma.template.count(),
      prisma.log.count({ where: { status: Status.SENT } }),
      prisma.log.count({ where: { status: { in: [Status.FAILED, Status.DEAD] } } }),
      prisma.log.count({ where: { status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] } } }),
      prisma.log.count({ where: { status: Status.RETRYING } }),
      prisma.log.count({ where: { status: Status.QUEUED } }),
      prisma.log.count({ where: { status: Status.PROCESSING } }),
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
    activeWorkers,
    legacyPlaintextSecrets: plaintextAccounts + plaintextBuckets,
  };
}
