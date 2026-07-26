import { randomUUID } from 'crypto';
import type { ConfirmChannel } from 'amqplib';
import {
  claimDueEnqueuePending,
  claimDueMessages,
  markMessageQueuedAfterPublish,
  markQueuedAfterPublish,
  releaseEnqueueClaim,
  recoverExpiredProcessingLeases,
  recoverExpiredMessageLeases,
  releaseMessageEnqueueClaim,
  releaseStaleMessageClaims,
  releaseStaleEnqueueClaims,
} from './db';
import { publishMain } from './queue';
import type { MailJob, QueueMessageV2, QueueMessageV3, WorkerConfig } from './types';

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
      const recovered = await recoverExpiredProcessingLeases();
      const recoveredMessages = await recoverExpiredMessageLeases();
      if (recovered.requeued > 0 || recovered.uncertain > 0) {
        console.warn(
          `[reconciler] Recovered expired processing leases: requeued=${recovered.requeued} uncertain=${recovered.uncertain}`,
        );
      }
      if (recoveredMessages.requeued > 0 || recoveredMessages.uncertain > 0) {
        console.warn(
          `[reconciler] Recovered expired message leases: requeued=${recoveredMessages.requeued} uncertain=${recoveredMessages.uncertain}`,
        );
      }
      await releaseStaleEnqueueClaims();
      await releaseStaleMessageClaims();
      const dueLogs = await claimDueEnqueuePending(DUE_ENQUEUE_CHUNK_SIZE, 10_000);
      for (const log of dueLogs) {
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
          await releaseEnqueueClaim(log.id, error);
        }
      }

      const dueMessages = await claimDueMessages(DUE_ENQUEUE_CHUNK_SIZE, 10_000);
      for (const messageRecord of dueMessages) {
        const message: QueueMessageV3 = {
          version: 3,
          messageId: messageRecord.id,
          attempt: 0,
          correlationId: messageRecord.correlationId,
        };
        try {
          await publishMain(channel, message, { source: 'enqueue-reconciler', version: 3 }, {
            messageId: message.messageId,
            correlationId: message.correlationId,
            timeoutMs: config.publishConfirmTimeoutMs,
          });
          await markMessageQueuedAfterPublish(message.messageId);
        } catch (error) {
          await releaseMessageEnqueueClaim(message.messageId, error);
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
