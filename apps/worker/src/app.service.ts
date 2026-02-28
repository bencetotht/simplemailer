import { Injectable } from '@nestjs/common';
import { MailJob } from './interfaces/mail';
import { DbService } from './db.service';
import { ValueError } from './value.error';
import { S3Service } from './s3.service';
import * as fs from 'fs';
import { TemplateService } from './mailer/template.service';

@Injectable()
export class AppService {
  constructor(
    private readonly dbService: DbService,
    private readonly s3Service: S3Service,
  ) {}

  async sendMail(id: string, data: MailJob): Promise<void> {
    try {
      const credentials = await this.dbService.getCredentials(data.accountId);
    } catch (error) {
      throw error;
    }
    return;
  }

  // Validate the maildata
  async validateMaildata(data: MailJob): Promise<void> {
    await this.dbService.validateAccount(data.accountId);
    await this.dbService.validateTemplate(data.templateId);
  }
}
