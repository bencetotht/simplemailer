import { Module } from '@nestjs/common';
import { QueueController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from './mailer/mailer.module';
import { DbService } from './db.service';
import { S3Service } from './s3.service';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 5000,
    }), 
    MailerModule,
  ],
  controllers: [QueueController],
  providers: [AppService, DbService, S3Service, PrismaService],
  exports: [S3Service, DbService],
})
export class AppModule {}
