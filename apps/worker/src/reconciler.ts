import { randomUUID } from 'crypto';
import type { ConfirmChannel } from 'amqplib';
import { Status } from 'database';
import { fetchDueEnqueuePending, markQueuedAfterPublish, updateLogStatus } from './db';
import { publishMain } from './queue';
import type { MailJob, QueueMessageV2, WorkerConfig } from './types';

const DUE_ENQUEUE_CHUNK_SIZE = 50;

export function isReadyForEnqueue(
  log: {
    scheduledFor: Date | null;
    updatedAt: Date;
  },
  now: Date,
  olderThanMs: number,
): boolean {
  if (log.scheduledFor) {
    return log.scheduledFor.getTime() <= now.getTime();
  }

  return log.updatedAt.getTime() <= now.getTime() - olderThanMs;
}

export function startEnqueueReconciler(
  getChannel: () => ConfirmChannel | null,
  config: WorkerConfig,
): { stop: () => void } {
  const timer = setInterval(async () => {
    const channel = getChannel();
    if (!channel) return;

    try {
      const now = new Date();
      const dueLogs = await fetchDueEnqueuePending(DUE_ENQUEUE_CHUNK_SIZE, 10_000);
      for (const log of dueLogs) {
        if (!isReadyForEnqueue(log, now, 10_000)) {
          continue;
        }

        const data: MailJob = {
          accountId: log.accountId,
          templateId: log.templateId,
          recipient: log.recipient,
          values: (log.values ?? {}) as Record<string, unknown>,
        };
        const message: QueueMessageV2 = {
          jobId: log.id,
          attempt: 0,
          correlationId: log.correlationId ?? randomUUID(),
          data,
        };

        try {
          await publishMain(channel, message, { source: 'enqueue-reconciler' }, {
            messageId: message.jobId,
            correlationId: message.correlationId,
            timeoutMs: config.publishConfirmTimeoutMs,
          });
          await markQueuedAfterPublish(log.id);
        } catch (error) {
          await updateLogStatus(log.id, Status.ENQUEUE_PENDING, {
            lastError: error instanceof Error ? error.message : String(error),
            failureClass: 'RECONCILE_PUBLISH_FAILED',
          });
        }
      }
    } catch (error) {
      console.error('[reconciler] Failed to reconcile enqueue-pending logs:', error);
    }
  }, config.enqueueReconcilerIntervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
