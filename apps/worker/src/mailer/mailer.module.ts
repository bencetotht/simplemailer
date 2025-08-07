import { Module } from '@nestjs/common';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { TemplateService } from './template.service';
import { S3Service } from 'src/s3.service';
import { DbService } from 'src/db.service';
import { PrismaService } from 'src/prisma.service';

@Module({
    providers: [MailProcessor, MailService, TemplateService, S3Service, DbService, PrismaService],
    exports: [MailProcessor, MailService, TemplateService],
})
export class MailerModule {}
