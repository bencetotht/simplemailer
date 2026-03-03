import amqp from "amqplib";
import { logServerError } from "@/lib/log";

const MAIN_EXCHANGE = "mailer.exchange";
const MAIN_QUEUE = "mailer";
const MAIN_ROUTING_KEY = "mail.send";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const RABBITMQ_API_URL = process.env.RABBITMQ_API_URL || "http://localhost:15672";

let channelPromise: Promise<amqp.ConfirmChannel> | null = null;

async function getChannel(): Promise<amqp.ConfirmChannel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const connection = await amqp.connect(RABBITMQ_URL);
      connection.on("close", () => {
        channelPromise = null;
      });
      connection.on("error", () => {
        channelPromise = null;
      });

      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(MAIN_EXCHANGE, "direct", { durable: true });
      await channel.assertQueue(MAIN_QUEUE, { durable: true });
      await channel.bindQueue(MAIN_QUEUE, MAIN_EXCHANGE, MAIN_ROUTING_KEY);
      return channel;
    })();
  }

  return channelPromise;
}

function waitForPublishConfirm(
  channel: amqp.ConfirmChannel,
  exchange: string,
  routingKey: string,
  payload: Buffer,
  options: amqp.Options.Publish,
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

export interface QueueMessageV2 {
  jobId: string;
  attempt: number;
  correlationId: string;
  data: unknown;
}

export async function publishToMailerQueue(
  message: QueueMessageV2,
  timeoutMs = 5000,
): Promise<void> {
  const channel = await getChannel();
  const payload = Buffer.from(JSON.stringify(message));
  try {
    await waitForPublishConfirm(
      channel,
      MAIN_EXCHANGE,
      MAIN_ROUTING_KEY,
      payload,
      {
        persistent: true,
        messageId: message.jobId,
        correlationId: message.correlationId,
        contentType: "application/json",
        headers: { attempt: message.attempt },
      },
      timeoutMs,
    );
  } catch (error) {
    logServerError("queue.publish_failed", error);
    channelPromise = null;
    throw error;
  }
}

function getRabbitApiAuthHeader(): string {
  const user = process.env.RABBITMQ_API_USER;
  const pass = process.env.RABBITMQ_API_PASS;
  if (!user || !pass) {
    throw new Error("RABBITMQ_API_USER and RABBITMQ_API_PASS are required");
  }
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export async function getQueueMessages(
  queue: string,
  limit = 10,
): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(`${RABBITMQ_API_URL}/api/queues/%2f/${queue}/get`, {
      method: "POST",
      headers: {
        Authorization: getRabbitApiAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        count: limit,
        ackmode: "ack_requeue_true",
        encoding: "auto",
        truncate: 50000,
      }),
    });

    if (!response.ok) {
      throw new Error(`RabbitMQ API returned ${response.status}`);
    }

    const messages = (await response.json()) as Record<string, unknown>[];
    return messages;
  } catch {
    logServerError("queue.peek_failed", "Unable to fetch queue messages");
    return [];
  }
}

function extractObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

export function redactQueueMessages(
  messages: Record<string, unknown>[],
): Record<string, unknown>[] {
  return messages.map((message) => {
    const properties = extractObject(message.properties);
    const headers = extractObject(properties.headers);
    return {
      exchange: message.exchange,
      routingKey: message.routing_key,
      redelivered: message.redelivered,
      messageCount: message.message_count,
      payloadBytes: message.payload_bytes,
      properties: {
        messageId: properties.message_id,
        correlationId: properties.correlation_id,
        contentType: properties.content_type,
        headers: {
          attempt: headers.attempt,
          retryCount: headers.retryCount,
          failureClass: headers.failureClass,
          failedAt: headers.failedAt,
        },
      },
      payload: "[REDACTED]",
    };
  });
}
