import amqplib from 'amqplib';
import type { Channel } from 'amqplib';
import type { WorkerConfig } from './types';

const MAIN_EXCHANGE = 'mailer.exchange';
const RETRY_EXCHANGE = 'mailer.retry';
const DLX_EXCHANGE = 'mailer.dlx';
const MAIN_QUEUE = 'mailer';
const RETRY_QUEUE = 'mailer.retry';
const DEAD_QUEUE = 'mailer.dead';

export interface AmqpConnection {
  connection: Awaited<ReturnType<typeof amqplib.connect>>;
  channel: Channel;
}

export async function connectRabbitMQ(config: WorkerConfig): Promise<AmqpConnection> {
  const connection = await amqplib.connect(config.rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.prefetch(config.prefetchCount);
  return { connection, channel };
}

export async function setupTopology(channel: Channel): Promise<void> {
  // Main exchange + queue
  // The mailer queue has NO x-dead-letter-exchange — the worker handles routing explicitly
  await channel.assertExchange(MAIN_EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(MAIN_QUEUE, { durable: true });
  await channel.bindQueue(MAIN_QUEUE, MAIN_EXCHANGE, 'mail.send');

  // Retry exchange + queue (per-message TTL expires → dead-letters back to main exchange)
  await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': MAIN_EXCHANGE,
      'x-dead-letter-routing-key': 'mail.send',
    },
  });
  await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, 'retry');

  // Dead letter exchange + queue (permanent resting place for exhausted messages)
  await channel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
  await channel.assertQueue(DEAD_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_QUEUE, DLX_EXCHANGE, '');
}

export function publishRetry(
  channel: Channel,
  data: unknown,
  headers: Record<string, unknown>,
  delayMs: number,
): void {
  channel.publish(
    RETRY_EXCHANGE,
    'retry',
    Buffer.from(JSON.stringify({ pattern: 'mail.send', data })),
    {
      persistent: true,
      headers,
      expiration: String(delayMs), // per-message TTL in ms
    },
  );
}

export function publishDeadLetter(
  channel: Channel,
  data: unknown,
  headers: Record<string, unknown>,
): void {
  channel.publish(
    DLX_EXCHANGE,
    '',
    Buffer.from(JSON.stringify({ pattern: 'mail.send', data })),
    { persistent: true, headers },
  );
}

export async function getQueueSize(channel: Channel): Promise<number> {
  const info = await channel.checkQueue(MAIN_QUEUE);
  return info.messageCount;
}
