import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Mailer Worker');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://root:root@localhost:5672'],
      queue: process.env.RABBITMQ_QUEUE || 'mailer',
      queueOptions: {
        durable: true,
        // deadLetterExchange: 'dlx',
      },
      noAck: false,
      prefetchCount: 1,
    },
  });
  await app.listen();
  logger.log('Mailer worker is running');
}
bootstrap();
