import { Module } from '@nestjs/common';
import { QueueController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from './mailer/mailer.module';

@Module({
  imports: [MailerModule],
  controllers: [QueueController],
  providers: [AppService],
})
export class AppModule {}
