import { randomUUID } from 'crypto';
import type { ConfirmChannel } from 'amqplib';
import { Status } from 'database';
import { fetchStaleEnqueuePending, markQueuedAfterPublish, updateLogStatus } from './db';
import { publishMain } from './queue';
import type { MailJob, QueueMessageV2, WorkerConfig } from './types';

export function startEnqueueReconciler(
  getChannel: () => ConfirmChannel | null,
  config: WorkerConfig,
): { stop: () => void } {
  const timer = setInterval(async () => {
    const channel = getChannel();
    if (!channel) return;

    try {
      const staleLogs = await fetchStaleEnqueuePending(100, 10_000);
      for (const log of staleLogs) {
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
