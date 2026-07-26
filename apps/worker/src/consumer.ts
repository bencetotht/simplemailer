import { randomUUID } from 'crypto';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { Status } from 'database';
import type { S3Client } from '@aws-sdk/client-s3';
import { CircuitBreaker } from './circuit-breaker';
import {
  claimLogForProcessing,
  claimMessageForProcessing,
  createLog,
  findLogById,
  getCredentials,
  getImmutableMessage,
  getTemplate,
  markDeliveryAttemptFailed,
  markDeliveryAttemptStarted,
  markMessageDeliveryFailed,
  markMessageDeliveryStarted,
  updateMessageStatus,
  updateLogStatus,
  validateAccount,
  validateTemplate,
} from './db';
import { CircuitOpenError, PermanentMailError, RetryableMailError, ValueError } from './errors';
import { logRedactedError } from './log';
import { sendImmutableMail, sendMail } from './mail';
import { publishDeadLetter, publishRetry } from './queue';
import type { Metrics } from './metrics';
import type { MailJob, QueueMessage, QueueMessageV2, QueueMessageV3, WorkerConfig } from './types';

interface ConsumerDeps {
  config: WorkerConfig;
  s3Client: S3Client | null;
  metrics: Metrics;
  breaker: CircuitBreaker;
}

function toQueueMessageV2(
  parsed: QueueMessage,
  msg: ConsumeMessage,
): QueueMessageV2 | null {
  if ((parsed as QueueMessageV2).jobId && typeof (parsed as QueueMessageV2).jobId === 'string') {
    return parsed as QueueMessageV2;
  }

  const data = 'data' in parsed ? parsed.data : null;
  if (!data) return null;

  const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
  const retryCount = Number(headers.retryCount ?? 0);

  return {
    jobId: String(msg.properties.messageId ?? headers.dbId ?? randomUUID()),
    attempt: Number.isFinite(retryCount) ? retryCount : 0,
    correlationId: String(msg.properties.correlationId ?? headers.correlationId ?? randomUUID()),
    data,
  };
}

function isQueueMessageV3(parsed: QueueMessage): parsed is QueueMessageV3 {
  const candidate = parsed as QueueMessageV3;
  return candidate.version === 3 &&
    typeof candidate.messageId === 'string' &&
    Number.isInteger(candidate.attempt) &&
    typeof candidate.correlationId === 'string';
}

function isValidMailJob(data: MailJob): boolean {
  return Boolean(data?.accountId && data?.templateId && data?.recipient && data?.values);
}

function getRetryDelayMs(attempt: number): number {
  const baseDelay = Math.min(2000 * Math.pow(2, Math.max(attempt - 1, 0)), 300_000);
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(baseDelay * jitterFactor);
}

async function deadLetterMalformedMessage(
  channel: ConfirmChannel,
  msg: ConsumeMessage,
  reason: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const payloadText = msg.content.toString();
    await publishDeadLetter(
      channel,
      {
        malformed: true,
        payload: payloadText,
      },
      {
        failureClass: 'MALFORMED_MESSAGE',
        failureReason: reason,
        failedAt: new Date().toISOString(),
      },
      timeoutMs,
    );
    channel.ack(msg);
    return true;
  } catch (err) {
    logRedactedError('consumer.deadletter_malformed_failed', err);
    channel.nack(msg, false, true);
    return false;
  }
}

export async function startConsumer(
  channel: ConfirmChannel,
  deps: ConsumerDeps,
): Promise<{ consumerTag: string; stop: () => Promise<void> }> {
  let inFlight = 0;
  let drainResolve: (() => void) | null = null;
  const { config, s3Client, metrics, breaker } = deps;

  const { consumerTag } = await channel.consume(
    config.rabbitmqQueue,
    async (msg) => {
      if (!msg) return;

      inFlight += 1;
      metrics.incInFlight();

      try {
        await handleMessage(msg, channel, config, s3Client, metrics, breaker);
      } catch (err) {
        logRedactedError('consumer.unhandled', err);
        channel.nack(msg, false, true);
      } finally {
        inFlight -= 1;
        metrics.decInFlight();
        if (inFlight === 0 && drainResolve) {
          drainResolve();
          drainResolve = null;
        }
      }
    },
    { noAck: false },
  );

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      channel.cancel(consumerTag).catch(() => {});
      if (inFlight === 0) {
        resolve();
      } else {
        drainResolve = resolve;
        setTimeout(resolve, 30_000);
      }
    });

  return { consumerTag, stop };
}

async function handleMessage(
  msg: ConsumeMessage,
  channel: ConfirmChannel,
  config: WorkerConfig,
  s3Client: S3Client | null,
  metrics: Metrics,
  breaker: CircuitBreaker,
): Promise<void> {
  let parsed: QueueMessage;
  try {
    parsed = JSON.parse(msg.content.toString()) as QueueMessage;
  } catch {
    await deadLetterMalformedMessage(channel, msg, 'Invalid JSON', config.publishConfirmTimeoutMs);
    return;
  }

  if (isQueueMessageV3(parsed)) {
    await handleImmutableMessage(parsed, msg, channel, config, metrics, breaker);
    return;
  }

  const queueMessage = toQueueMessageV2(parsed, msg);
  if (!queueMessage || !isValidMailJob(queueMessage.data)) {
    await deadLetterMalformedMessage(channel, msg, 'Missing required fields', config.publishConfirmTimeoutMs);
    return;
  }

  const data = queueMessage.data;

  try {
    await Promise.all([validateAccount(data.accountId), validateTemplate(data.templateId)]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await deadLetterMalformedMessage(channel, msg, `Validation failed: ${reason}`, config.publishConfirmTimeoutMs);
    return;
  }

  const existingLog = await findLogById(queueMessage.jobId);
  const logEntry =
    existingLog ??
    (await createLog(data, {
      correlationId: queueMessage.correlationId,
    }));

  if (
    logEntry.status === Status.SENT ||
    logEntry.status === Status.FAILED ||
    logEntry.status === Status.DEAD ||
    logEntry.status === Status.DELIVERY_UNCERTAIN
  ) {
    channel.ack(msg);
    return;
  }

  const claimed = await claimLogForProcessing(
    logEntry.id,
    config.workerId,
    config.processingLeaseMs,
  );
  if (!claimed) {
    channel.ack(msg);
    return;
  }

  let breakerKey: string | null = null;
  let smtpAccepted = false;
  try {
    const [account, template] = await Promise.all([
      getCredentials(data.accountId),
      getTemplate(data.templateId),
    ]);

    breakerKey = `${data.accountId}:${account.emailHost}`;
    const attemptState = breaker.canAttempt(breakerKey);
    if (!attemptState.allowed) {
      throw new CircuitOpenError(attemptState.reason ?? 'circuit-open');
    }

    await sendMail(account, template, data, config, s3Client, async () => {
      const deliveryStarted = await markDeliveryAttemptStarted(logEntry.id, config.workerId);
      if (!deliveryStarted) {
        throw new RetryableMailError('Processing lease expired before SMTP delivery began');
      }
    });
    smtpAccepted = true;
    breaker.recordSuccess(breakerKey);
    metrics.setOpenCircuits(breaker.getOpenCircuits());
    metrics.processedTotal.inc();

    await updateLogStatus(logEntry.id, Status.SENT, {
      processingOwner: config.workerId,
      lastError: null,
      failureClass: null,
      nextAttemptAt: null,
      lastAttemptAt: new Date(),
    });
    channel.ack(msg);
    return;
  } catch (error) {
    if (smtpAccepted) {
      logRedactedError('consumer.smtp_accepted_status_persist_failed', error, {
        logId: logEntry.id,
        workerId: config.workerId,
      });
      channel.nack(msg, false, true);
      return;
    }
    await markDeliveryAttemptFailed(logEntry.id, config.workerId);
    if (breakerKey && (error instanceof RetryableMailError || error instanceof CircuitOpenError)) {
      breaker.recordRetryableFailure(breakerKey);
    }
    metrics.setOpenCircuits(breaker.getOpenCircuits());

    const err = error instanceof Error ? error : new Error(String(error));
    const retryable = err instanceof RetryableMailError || err instanceof CircuitOpenError;

    if (retryable) {
      const nextAttempt = queueMessage.attempt + 1;
      const delayMs = getRetryDelayMs(nextAttempt);
      const retryPayload: QueueMessageV2 = {
        ...queueMessage,
        attempt: nextAttempt,
      };

      if (nextAttempt <= config.maxRetries) {
        try {
          await publishRetry(
            channel,
            retryPayload,
            {
              retryCount: nextAttempt,
              jobId: logEntry.id,
              correlationId: queueMessage.correlationId,
              failureClass: err.name,
              failureReason: err.message,
              failedAt: new Date().toISOString(),
            },
            delayMs,
            config.publishConfirmTimeoutMs,
          );

          await updateLogStatus(logEntry.id, Status.RETRYING, {
            processingOwner: config.workerId,
            retryCount: nextAttempt,
            lastError: err.message,
            failureClass: err.name,
            nextAttemptAt: new Date(Date.now() + delayMs),
            lastAttemptAt: new Date(),
          });
          channel.ack(msg);
        } catch (publishErr) {
          logRedactedError('consumer.retry_publish_failed', publishErr, {
            logId: logEntry.id,
            attempt: nextAttempt,
          });
          channel.nack(msg, false, true);
        }
        return;
      }
    }

    try {
      await publishDeadLetter(
        channel,
        queueMessage,
        {
          retryCount: queueMessage.attempt,
          jobId: logEntry.id,
          correlationId: queueMessage.correlationId,
          failureClass: err.name,
          failureReason: err.message,
          failedAt: new Date().toISOString(),
        },
        config.publishConfirmTimeoutMs,
      );

      const terminalStatus =
        err instanceof PermanentMailError || err instanceof ValueError ? Status.FAILED : Status.DEAD;
      await updateLogStatus(logEntry.id, terminalStatus, {
        processingOwner: config.workerId,
        retryCount: queueMessage.attempt,
        lastError: err.message,
        failureClass: err.name,
        nextAttemptAt: null,
        lastAttemptAt: new Date(),
      });
      channel.ack(msg);
    } catch (publishErr) {
      logRedactedError('consumer.deadletter_publish_failed', publishErr, {
        logId: logEntry.id,
        attempt: queueMessage.attempt,
      });
      channel.nack(msg, false, true);
    }
  }
}

async function handleImmutableMessage(
  queueMessage: QueueMessageV3,
  msg: ConsumeMessage,
  channel: ConfirmChannel,
  config: WorkerConfig,
  metrics: Metrics,
  breaker: CircuitBreaker,
): Promise<void> {
  let message;
  try {
    message = await getImmutableMessage(queueMessage.messageId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deadLetterMalformedMessage(
      channel,
      msg,
      `Immutable message load failed: ${reason}`,
      config.publishConfirmTimeoutMs,
    );
    return;
  }

  if (
    message.status === Status.SENT ||
    message.status === Status.FAILED ||
    message.status === Status.DEAD ||
    message.status === Status.DELIVERY_UNCERTAIN
  ) {
    channel.ack(msg);
    return;
  }

  const claimed = await claimMessageForProcessing(
    message.id,
    config.workerId,
    config.processingLeaseMs,
  );
  if (!claimed) {
    channel.ack(msg);
    return;
  }

  let breakerKey: string | null = null;
  let smtpAccepted = false;
  try {
    const account = await getCredentials(message.accountId);
    breakerKey = `${message.accountId}:${account.emailHost}`;
    const attemptState = breaker.canAttempt(breakerKey);
    if (!attemptState.allowed) {
      throw new CircuitOpenError(attemptState.reason ?? 'circuit-open');
    }

    await sendImmutableMail(account, message, config, async () => {
      const deliveryStarted = await markMessageDeliveryStarted(message.id, config.workerId);
      if (!deliveryStarted) {
        throw new RetryableMailError('Processing lease expired before SMTP delivery began');
      }
    });
    smtpAccepted = true;
    breaker.recordSuccess(breakerKey);
    metrics.setOpenCircuits(breaker.getOpenCircuits());
    metrics.processedTotal.inc();
    await updateMessageStatus(message.id, Status.SENT, {
      processingOwner: config.workerId,
      lastError: null,
      failureClass: null,
      nextAttemptAt: null,
      lastAttemptAt: new Date(),
    });
    channel.ack(msg);
    return;
  } catch (error) {
    if (smtpAccepted) {
      logRedactedError('consumer.v3.smtp_accepted_status_persist_failed', error, {
        messageId: message.id,
        workerId: config.workerId,
      });
      channel.nack(msg, false, true);
      return;
    }
    await markMessageDeliveryFailed(message.id, config.workerId);
    if (breakerKey && (error instanceof RetryableMailError || error instanceof CircuitOpenError)) {
      breaker.recordRetryableFailure(breakerKey);
    }
    metrics.setOpenCircuits(breaker.getOpenCircuits());

    const err = error instanceof Error ? error : new Error(String(error));
    const retryable = err instanceof RetryableMailError || err instanceof CircuitOpenError;
    if (retryable) {
      const nextAttempt = queueMessage.attempt + 1;
      const delayMs = getRetryDelayMs(nextAttempt);
      const retryPayload: QueueMessageV3 = { ...queueMessage, attempt: nextAttempt };
      if (nextAttempt <= config.maxRetries) {
        try {
          await publishRetry(
            channel,
            retryPayload,
            {
              version: 3,
              retryCount: nextAttempt,
              messageId: message.id,
              correlationId: queueMessage.correlationId,
              failureClass: err.name,
              failureReason: err.message,
              failedAt: new Date().toISOString(),
            },
            delayMs,
            config.publishConfirmTimeoutMs,
          );
          await updateMessageStatus(message.id, Status.RETRYING, {
            processingOwner: config.workerId,
            retryCount: nextAttempt,
            lastError: err.message,
            failureClass: err.name,
            nextAttemptAt: new Date(Date.now() + delayMs),
            lastAttemptAt: new Date(),
          });
          channel.ack(msg);
        } catch (publishError) {
          logRedactedError('consumer.v3.retry_publish_failed', publishError, {
            messageId: message.id,
            attempt: nextAttempt,
          });
          channel.nack(msg, false, true);
        }
        return;
      }
    }

    try {
      await publishDeadLetter(
        channel,
        queueMessage,
        {
          version: 3,
          retryCount: queueMessage.attempt,
          messageId: message.id,
          correlationId: queueMessage.correlationId,
          failureClass: err.name,
          failureReason: err.message,
          failedAt: new Date().toISOString(),
        },
        config.publishConfirmTimeoutMs,
      );
      const terminalStatus =
        err instanceof PermanentMailError || err instanceof ValueError ? Status.FAILED : Status.DEAD;
      await updateMessageStatus(message.id, terminalStatus, {
        processingOwner: config.workerId,
        retryCount: queueMessage.attempt,
        lastError: err.message,
        failureClass: err.name,
        nextAttemptAt: null,
        lastAttemptAt: new Date(),
      });
      channel.ack(msg);
    } catch (publishError) {
      logRedactedError('consumer.v3.deadletter_publish_failed', publishError, {
        messageId: message.id,
        attempt: queueMessage.attempt,
      });
      channel.nack(msg, false, true);
    }
  }
}
