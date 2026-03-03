import amqplib from 'amqplib';
import type { ConfirmChannel, Options } from 'amqplib';
import type { WorkerConfig } from './types';

const MAIN_EXCHANGE = 'mailer.exchange';
const RETRY_EXCHANGE = 'mailer.retry';
const DLX_EXCHANGE = 'mailer.dlx';
const MAIN_QUEUE = 'mailer';
const RETRY_QUEUE = 'mailer.retry';
const DEAD_QUEUE = 'mailer.dead';
const MAIN_ROUTING_KEY = 'mail.send';
const RETRY_ROUTING_KEY = 'retry';

export interface AmqpConnection {
  connection: Awaited<ReturnType<typeof amqplib.connect>>;
  channel: ConfirmChannel;
}

export async function connectRabbitMQ(config: WorkerConfig): Promise<AmqpConnection> {
  const connection = await amqplib.connect(config.rabbitmqUrl);
  const channel = await connection.createConfirmChannel();
  await channel.prefetch(config.prefetchCount);
  return { connection, channel };
}

export async function setupTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(MAIN_EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(MAIN_QUEUE, { durable: true });
  await channel.bindQueue(MAIN_QUEUE, MAIN_EXCHANGE, MAIN_ROUTING_KEY);

  await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': MAIN_EXCHANGE,
      'x-dead-letter-routing-key': MAIN_ROUTING_KEY,
    },
  });
  await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, RETRY_ROUTING_KEY);

  await channel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
  await channel.assertQueue(DEAD_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_QUEUE, DLX_EXCHANGE, '');
}

function waitForPublishConfirm(
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  payload: Buffer,
  options: Options.Publish,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Publish confirm timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    channel.publish(exchange, routingKey, payload, options, (err) => {
      clearTimeout(timeout);
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function publishMain(
  channel: ConfirmChannel,
  payload: unknown,
  headers: Record<string, unknown>,
  options: { messageId: string; correlationId: string; timeoutMs: number },
): Promise<void> {
  await waitForPublishConfirm(
    channel,
    MAIN_EXCHANGE,
    MAIN_ROUTING_KEY,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      messageId: options.messageId,
      correlationId: options.correlationId,
      contentType: 'application/json',
      headers,
    },
    options.timeoutMs,
  );
}

export async function publishRetry(
  channel: ConfirmChannel,
  payload: unknown,
  headers: Record<string, unknown>,
  delayMs: number,
  timeoutMs: number,
): Promise<void> {
  await waitForPublishConfirm(
    channel,
    RETRY_EXCHANGE,
    RETRY_ROUTING_KEY,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      headers,
      expiration: String(delayMs),
      contentType: 'application/json',
    },
    timeoutMs,
  );
}

export async function publishDeadLetter(
  channel: ConfirmChannel,
  payload: unknown,
  headers: Record<string, unknown>,
  timeoutMs: number,
): Promise<void> {
  await waitForPublishConfirm(
    channel,
    DLX_EXCHANGE,
    '',
    Buffer.from(JSON.stringify(payload)),
    { persistent: true, headers, contentType: 'application/json' },
    timeoutMs,
  );
}

export async function getQueueSize(channel: ConfirmChannel): Promise<number> {
  const info = await channel.checkQueue(MAIN_QUEUE);
  return info.messageCount;
}
