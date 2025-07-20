import { Module } from '@nestjs/common';
import { QueueController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from './mailer/mailer.module';
import { DbService } from './db.service';
@Module({
  imports: [MailerModule],
  controllers: [QueueController],
  providers: [AppService, DbService],
})
export class AppModule {}
