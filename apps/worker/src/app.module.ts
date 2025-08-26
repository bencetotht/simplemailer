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

@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 5000,
    }), 
    MailerModule,
  ],
  controllers: [QueueController, ApiController],
  providers: [AppService, DbService, S3Service, PrismaService, ApiService, QueueService, ConfigParser, WebsocketGateway, CustomLogger],
  exports: [S3Service, DbService, CustomLogger],
})
export class AppModule {}
