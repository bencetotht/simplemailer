import amqp from "amqplib";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://root:root@localhost:5672";
const RABBITMQ_API_URL =
  process.env.RABBITMQ_API_URL || "http://localhost:15672";

let channelPromise: Promise<amqp.Channel> | null = null;

async function getChannel(): Promise<amqp.Channel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue("mailer", { durable: true });
      return channel;
    })();
  }
  return channelPromise;
}

export async function publishToMailerQueue(data: unknown): Promise<{ success: boolean; message: string }> {
  try {
    const channel = await getChannel();
    const sendData = { pattern: "mail.send", data };
    channel.sendToQueue(
      "mailer",
      Buffer.from(JSON.stringify(sendData)),
      { persistent: true }
    );
    return { success: true, message: "Message sent to queue 'mailer' for @MessagePattern" };
  } catch {
    channelPromise = null;
    return { success: false, message: "Error publishing to queue" };
  }
}

export async function getQueueMessages(
  queue: string,
  limit: number = 10
): Promise<Record<string, unknown>[]> {
  try {
    const auth = Buffer.from("root:root").toString("base64");
    const response = await fetch(
      `${RABBITMQ_API_URL}/api/queues/%2f/${queue}/get`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          count: limit,
          ackmode: "ack_requeue_true",
          encoding: "auto",
          truncate: 50000,
        }),
      }
    );
    const messages = await response.json();
    return messages;
  } catch {
    return [];
  }
}
