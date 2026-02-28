import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MailJob } from "./interfaces/mail";
import amqp from "amqp-connection-manager";
import ChannelWrapper from "amqp-connection-manager/dist/types/ChannelWrapper";
import { MailerMaxRetriesError } from "./mailer/mailer.error";


@Injectable()
export class QueueService implements OnModuleInit {
  private logger = new Logger(QueueService.name);
  constructor() {}

  onModuleInit() {
    this.initializeApp();
  }

  private async initializeApp() { 
    const conn_uri = process.env.RABBITMQ_URL || 'amqp://root:root@localhost:5672';
    const connection = amqp.connect(conn_uri);
    const channel = connection.createChannel();
    
    // await this.setupDelayInfrastructure(channel);
  }

  // private async setupDelayInfrastructure(channel: ChannelWrapper) {
  //   await channel.assertExchange('delay-exchange', 'direct', { durable: true });
    
  //   await channel.assertQueue('delay-queue', {
  //     durable: true,
  //     arguments: {
  //       'x-dead-letter-exchange': '', // Default exchange
  //       'x-dead-letter-routing-key': 'mailer'  
  //     }
  //   });
    
  //   await channel.bindQueue('delay-queue', 'delay-exchange', 'delay-routing-key');
    
  //   await channel.assertQueue('mailer', { durable: true });
    
  //   this.logger.log('Delay infrastructure setup complete');
  // }

  public async getQueue(queue: string, limit: number = 10): Promise<Record<string, any>[]> {
    try {
      const auth = Buffer.from('root:root').toString('base64');
      const response = await fetch(`${process.env.RABBITMQ_API_URL}/api/queues/%2f/${queue}/get`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: limit,
            ackmode: 'ack_requeue_true',
            encoding: 'auto',
            truncate: 50000,
          }),
        });
      const messages = await response.json();
      return messages;
    } catch (error) {
      this.logger.error("Error getting queue:", error);
      return []
    }
  }

  public async addToQueue(queue: string, data: MailJob): Promise<{success: boolean, message: string}> {
    try {
      const channel = await this.getChannel();
      const sendData = {
        pattern: "mail.send",
        data: data
      };
      await channel.sendToQueue('mailer', Buffer.from(JSON.stringify(sendData)), { persistent: true });
      this.logger.log("Message sent to queue 'mailer' for @MessagePattern");
      return {success: true, message: "Message sent to queue 'mailer' for @MessagePattern"};
    } catch (error) {
      this.logger.error("Error publishing to queue:", error);
      return {success: false, message: "Error publishing to queue"};
    }
  }

  private async getChannel() {
    try {
      const connection = await amqp.connect('amqp://root:root@localhost:5672');
      const channel = await connection.createChannel();
      await channel.assertQueue('mailer', { durable: true });
      return channel;
    } catch (error) {
      this.logger.error("Error connecting to RabbitMQ:", error);
      throw error;
    }
  }

  public async publishToQueue (data: any) {
    try {
      const channel = await this.getChannel();
      const sendData = {
        pattern: "mail.send",
        data: data
      };
      await channel.sendToQueue('mailer', Buffer.from(JSON.stringify(sendData)), { persistent: true });
      console.log("Message sent to queue 'mailer' for @MessagePattern");
    } catch (error) {
      console.error("Error publishing to queue:", error);
      throw error;
    }
  }

  async handleFailedJob(channel, payload, originalMessage, error, dbId: string): Promise<{retryCount: number, maxRetries: number}> {
    const retryCount = (originalMessage.properties.headers?.retryCount || 0) + 1;
    const maxRetries = 5;
    const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 30000); // exponential backoff, max 30s
    
    channel.nack(originalMessage, false, false);

    const headers = {
      ...originalMessage.properties.headers,
      retryCount: retryCount,
      originalQueue: 'mailer',
      failureReason: error.message,
      failedAt: new Date().toISOString(),
      'x-delay': delayMs,
      dbId: dbId,
    }

    if (retryCount <= maxRetries) { // if there are retries left, send the message to the queue again
      await channel.sendToQueue('mailer', Buffer.from(JSON.stringify({pattern: 'mail.send', data: payload})), { persistent: true, headers: headers });
      return {retryCount: retryCount, maxRetries: maxRetries}
    }
    else {
      throw new MailerMaxRetriesError(`Retries exhausted after ${maxRetries} attempts`)
    }
    
  }

  public async getQueueSize() {
    const channel = await this.getChannel();
    const queue = await channel.assertQueue('mailer', { durable: true });
    return queue.messageCount;
  }
}

