import { Module } from '@nestjs/common';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Module({
    providers: [MailProcessor, MailService],
    exports: [MailProcessor, MailService],
})
export class MailerModule {}
