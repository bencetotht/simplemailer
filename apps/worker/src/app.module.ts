import { Module } from '@nestjs/common';
import { QueueController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from './mailer/mailer.module';
import { DbService } from './db.service';
import { S3Service } from './s3.service';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from './prisma.service';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { QueueService } from './queue.service';
import { ConfigParser } from './config.parser';
import { WebsocketGateway } from './websocket.gateway';
import { CustomLogger } from './custom.logger';
import {
  makeCounterProvider,
  makeGaugeProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { PrometheusService } from './prometheus.service';

@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 5000,
    }),
    MailerModule,
    PrometheusModule.register({
      defaultLabels: {
        app: 'mailer-worker',
      },
      path: '/metrics',
    }),
  ],
  controllers: [QueueController, ApiController],
  providers: [
    AppService,
    DbService,
    S3Service,
    PrismaService,
    ApiService,
    QueueService,
    ConfigParser,
    WebsocketGateway,
    CustomLogger,
    PrometheusService,
    makeCounterProvider({
      name: 'mailer_active_mails',
      help: 'Number of emails currently being processed',
    }),
    makeCounterProvider({
      name: 'mailer_concurrent_mails',
      help: 'Number of emails processed in last 5 minutes',
    }),
    makeGaugeProvider({
      name: 'mailer_send_rate',
      help: 'Number of emails sent per minute',
    }),
    makeGaugeProvider({
      name: 'mailer_queue_size',
      help: 'Total number of emails in the queue',
    }),
    makeGaugeProvider({
      name: 'mailer_mails_sent_total',
      help: 'Total number of emails sent',
    }),
    makeGaugeProvider({
      name: 'mailer_mails_failed',
      help: 'Total number of emails failed',
    }),
    makeGaugeProvider({
      name: 'mailer_mails_pending',
      help: 'Total number of emails pending',
    }),
    makeGaugeProvider({
      name: 'mailer_accounts',
      help: 'Total number of accounts',
    }),
    makeGaugeProvider({
      name: 'mailer_templates',
      help: 'Total number of templates',
    }),
    makeGaugeProvider({
      name: 'mailer_health_status',
      help: 'Health status of the mailer service (1 = healthy, 0 = unhealthy)',
    }),
  ],
  exports: [S3Service, DbService, CustomLogger],
})
export class AppModule {}
