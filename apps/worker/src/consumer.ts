import type { Channel, ConsumeMessage } from 'amqplib';
import { Status } from 'database';
import type * as Minio from 'minio';
import type { MailJob, QueueMessage, WorkerConfig } from './types';
import { MailerError, ValueError } from './errors';
import { createLog, updateLogStatus, validateAccount, validateTemplate, getCredentials, getTemplate } from './db';
import { sendMail } from './mail';
import { publishRetry, publishDeadLetter } from './queue';
import type { Metrics } from './metrics';

interface ConsumerDeps {
  config: WorkerConfig;
  s3Client: Minio.Client | null;
  metrics: Metrics;
}

export async function startConsumer(
  channel: Channel,
  deps: ConsumerDeps,
): Promise<{ consumerTag: string; stop: () => Promise<void> }> {
  let inFlight = 0;
  let drainResolve: (() => void) | null = null;
  const { config, s3Client, metrics } = deps;

  const { consumerTag } = await channel.consume(
    config.rabbitmqQueue,
    async (msg) => {
      if (!msg) return; // consumer cancelled

      inFlight++;
      metrics.concurrentMails.inc();
      metrics.activeMails.inc();

      try {
        await handleMessage(msg, channel, config, s3Client);
      } catch (err) {
        console.error('[consumer] Unhandled error in message handler:', err);
        channel.nack(msg, false, false);
      } finally {
        inFlight--;
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
        // Force resolve after 30-second timeout
        setTimeout(resolve, 30_000);
      }
    });

  return { consumerTag, stop };
}

async function handleMessage(
  msg: ConsumeMessage,
  channel: Channel,
  config: WorkerConfig,
  s3Client: Minio.Client | null,
): Promise<void> {
  // Parse envelope
  let parsed: QueueMessage;
  try {
    parsed = JSON.parse(msg.content.toString()) as QueueMessage;
  } catch {
    console.error('[consumer] Failed to parse message JSON');
    channel.nack(msg, false, false);
    return;
  }

  const data: MailJob = parsed.data;

  // Validate required fields
  if (!data?.accountId || !data?.templateId || !data?.recipient || !data?.values) {
    console.error('[consumer] Invalid message: missing required fields');
    channel.nack(msg, false, false);
    return;
  }

  // Validate account and template exist before creating a log
  try {
    await Promise.all([
      validateAccount(data.accountId),
      validateTemplate(data.templateId),
    ]);
  } catch (err) {
    console.error(`[consumer] Validation failed — dropping message: ${err}`);
    channel.nack(msg, false, false);
    return;
  }

  // Determine if this is a retry (check headers)
  const headers = msg.properties.headers ?? {};
  const retryCount: number = (headers.retryCount as number) || 0;
  const isRetry = retryCount > 0;
  const dbId: string | undefined = headers.dbId as string | undefined;

  // Create or update DB log entry
  const logEntry =
    isRetry && dbId
      ? await updateLogStatus(dbId, Status.RETRYING, { retryCount, lastError: headers.failureReason as string | undefined })
      : await createLog(data);

  if (!isRetry) {
    console.log(`[consumer] Sending mail to ${data.recipient} (job ${logEntry.id})`);
  } else {
    console.log(`[consumer] Retrying mail to ${data.recipient} (job ${logEntry.id}, attempt ${retryCount})`);
  }

  try {
    // Fetch credentials and template in parallel (single DB round-trip)
    const [account, template] = await Promise.all([
      getCredentials(data.accountId),
      getTemplate(data.templateId),
    ]);

    await sendMail(account, template, data, config, s3Client);

    channel.ack(msg);
    await updateLogStatus(logEntry.id, Status.SENT);
    console.log(`[consumer] Mail sent to ${data.recipient} (job ${logEntry.id})`);
  } catch (err) {
    if (err instanceof MailerError) {
      // Transient failure — retry with exponential backoff
      const newRetryCount = retryCount + 1;
      const delayMs = Math.min(1000 * Math.pow(2, newRetryCount - 1), 30_000);

      channel.nack(msg, false, false);

      if (newRetryCount <= config.maxRetries) {
        const retryHeaders = {
          ...headers,
          retryCount: newRetryCount,
          originalQueue: 'mailer',
          failureReason: err.message,
          failedAt: new Date().toISOString(),
          dbId: logEntry.id,
        };
        publishRetry(channel, data, retryHeaders, delayMs);
        await updateLogStatus(logEntry.id, Status.RETRYING, { retryCount: newRetryCount, lastError: err.message });
        console.warn(
          `[consumer] Retry ${newRetryCount}/${config.maxRetries} for ${data.recipient} ` +
          `(job ${logEntry.id}) in ${delayMs}ms: ${err.message}`,
        );
      } else {
        const dlxHeaders = {
          ...headers,
          failureReason: err.message,
          failedAt: new Date().toISOString(),
          dbId: logEntry.id,
        };
        publishDeadLetter(channel, data, dlxHeaders);
        await updateLogStatus(logEntry.id, Status.FAILED, { retryCount: newRetryCount, lastError: err.message });
        console.error(
          `[consumer] Max retries exhausted for ${data.recipient} (job ${logEntry.id}) — moved to dead letter queue`,
        );
      }
    } else if (err instanceof ValueError) {
      // Permanent failure — do not retry
      channel.nack(msg, false, false);
      await updateLogStatus(logEntry.id, Status.FAILED, { lastError: err.message });
      console.error(
        `[consumer] Permanent failure for ${data.recipient} (job ${logEntry.id}): ${err.message}`,
      );
    } else {
      // Unexpected error
      channel.nack(msg, false, false);
      await updateLogStatus(logEntry.id, Status.FAILED, { lastError: err instanceof Error ? err.message : String(err) });
      console.error(
        `[consumer] Unexpected error for ${data.recipient} (job ${logEntry.id}):`,
        err,
      );
    }
  }
}
