import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Mailer Worker');
  
  const app = await NestFactory.create(AppModule);
  
  const microservice = app.connectMicroservice<MicroserviceOptions>({
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
  
  // Start both HTTP and microservice
  await app.startAllMicroservices();
  const port = process.env.PORT || 3000;
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port);
  
  logger.log(`Mailer worker is running in hybrid mode - HTTP on port ${port} and microservice listening to RabbitMQ`);
}

bootstrap();
