import { createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  prisma,
  type Prisma,
  type WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
} from 'database';
import { decryptSecret } from './secrets';
import type { Metrics } from './metrics';
import type { WorkerConfig } from './types';

const CLAIM_LIMIT = 25;

type ClaimedDelivery = WebhookDelivery & {
  event: { id: string; payload: Prisma.JsonValue };
};

export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
}

export function webhookRetryDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60 * 1000);
  return Math.round(base * (0.8 + random() * 0.4));
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

async function assertSafeDeliveryTarget(targetUrl: string): Promise<void> {
  const url = new URL(targetUrl);
  const localDevelopment =
    process.env.NODE_ENV !== 'production' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (localDevelopment) return;
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Webhook target resolved to a private network address');
  }
}

async function claimDeliveries(
  workerId: string,
  leaseMs: number,
): Promise<ClaimedDelivery[]> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<WebhookDelivery[]>`
      SELECT delivery.*
      FROM "public"."WebhookDelivery" delivery
      JOIN "public"."WebhookEndpoint" endpoint ON endpoint."id" = delivery."endpointId"
      WHERE (
        (delivery."status" = 'PENDING'::"public"."WebhookDeliveryStatus"
          AND delivery."nextAttemptAt" <= ${now})
        OR
        (delivery."status" = 'PROCESSING'::"public"."WebhookDeliveryStatus"
          AND delivery."leaseExpiresAt" <= ${now})
      )
      AND endpoint."status" = 'ACTIVE'::"public"."WebhookEndpointStatus"
      ORDER BY delivery."nextAttemptAt" ASC
      LIMIT ${CLAIM_LIMIT}
      FOR UPDATE OF delivery SKIP LOCKED
    `;
    if (rows.length === 0) return [];
    await tx.webhookDelivery.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: {
        status: WebhookDeliveryStatus.PROCESSING,
        processingOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        attemptCount: { increment: 1 },
      },
    });
    return tx.webhookDelivery.findMany({
      where: { id: { in: rows.map((row) => row.id) }, processingOwner: workerId },
      include: { event: { select: { id: true, payload: true } } },
    });
  });
}

async function recordSuccess(delivery: ClaimedDelivery, workerId: string, status: number) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.webhookDelivery.updateMany({
      where: { id: delivery.id, processingOwner: workerId },
      data: {
        status: WebhookDeliveryStatus.SUCCEEDED,
        responseStatus: status,
        responseSummary: `HTTP ${status}`,
        lastError: null,
        deliveredAt: now,
        processingOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count === 0) return;
    await tx.webhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: {
        consecutiveFailures: 0,
        lastSuccessAt: now,
      },
    });
  });
}

async function recordFailure(
  delivery: ClaimedDelivery,
  workerId: string,
  input: {
    responseStatus?: number;
    reason: string;
    config: WorkerConfig;
  },
) {
  const now = new Date();
  const exhausted = delivery.attemptCount >= input.config.webhookMaxAttempts;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.webhookDelivery.updateMany({
      where: { id: delivery.id, processingOwner: workerId },
      data: {
        status: exhausted ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
        nextAttemptAt: exhausted
          ? now
          : new Date(now.getTime() + webhookRetryDelayMs(delivery.attemptCount)),
        responseStatus: input.responseStatus,
        responseSummary: input.responseStatus ? `HTTP ${input.responseStatus}` : null,
        lastError: input.reason.slice(0, 256),
        processingOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count === 0) return;
    const endpoint = await tx.webhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: {
        consecutiveFailures: { increment: 1 },
        lastFailureAt: now,
      },
    });
    if (
      endpoint.status !== WebhookEndpointStatus.DISABLED &&
      endpoint.consecutiveFailures >= input.config.webhookDisableAfterFailures
    ) {
      await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          status: WebhookEndpointStatus.DISABLED,
          disabledAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          id: `aud_${randomUUID().replaceAll('-', '')}`,
          projectId: endpoint.projectId,
          action: 'webhook.endpoint.auto_disabled',
          targetType: 'webhook_endpoint',
          targetId: endpoint.id,
          metadata: {
            consecutiveFailures: endpoint.consecutiveFailures,
            deliveryId: delivery.id,
          },
        },
      });
    }
  });
}

async function deliver(
  delivery: ClaimedDelivery,
  config: WorkerConfig,
  metrics: Metrics,
): Promise<void> {
  const body = JSON.stringify(delivery.event.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = decryptSecret(delivery.signingSecretEnc);
  const signature = signWebhookBody(secret, timestamp, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.webhookRequestTimeoutMs);
  try {
    await assertSafeDeliveryTarget(delivery.targetUrl);
    const response = await fetch(delivery.targetUrl, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'user-agent': `SimpleMailer-Webhooks/${config.workerVersion}`,
        'simplemailer-event-id': delivery.event.id,
        'simplemailer-timestamp': String(timestamp),
        'simplemailer-signature': `v1=${signature}`,
      },
      body,
    });
    if (response.status >= 200 && response.status < 300) {
      await recordSuccess(delivery, config.workerId, response.status);
      metrics.webhookDeliveries.inc({ outcome: 'succeeded' });
      return;
    }
    await recordFailure(delivery, config.workerId, {
      responseStatus: response.status,
      reason: 'Endpoint returned a non-success status',
      config,
    });
    metrics.webhookDeliveries.inc({
      outcome: delivery.attemptCount >= config.webhookMaxAttempts ? 'failed' : 'retrying',
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'Webhook request timed out'
        : 'Webhook network request failed';
    await recordFailure(delivery, config.workerId, { reason, config });
    metrics.webhookDeliveries.inc({
      outcome: delivery.attemptCount >= config.webhookMaxAttempts ? 'failed' : 'retrying',
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function startWebhookDispatcher(
  config: WorkerConfig,
  metrics: Metrics,
): { stop: () => Promise<void> } {
  let stopped = false;
  let running: Promise<void> | null = null;
  const run = async () => {
    if (stopped || running) return;
    running = (async () => {
      const deliveries = await claimDeliveries(config.workerId, config.webhookLeaseMs);
      await Promise.all(deliveries.map((delivery) => deliver(delivery, config, metrics)));
    })()
      .catch((error) => {
        console.error('[webhooks] Dispatch iteration failed:', error);
      })
      .finally(() => {
        running = null;
      });
    await running;
  };
  const timer = setInterval(() => void run(), config.webhookDispatchIntervalMs);
  void run();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
