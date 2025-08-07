import { Injectable } from '@nestjs/common';
import { MailJob } from './interfaces/mail';
import { DbService } from './db.service';
import { ValueError } from './value.error';
import { S3Service } from './s3.service';

@Injectable()
export class AppService {
  constructor(private readonly dbService: DbService, private readonly s3Service: S3Service) {}

  async sendMail(id: string, data: MailJob): Promise<void> {
    try { 
      const credentials = await this.dbService.getCredentials(data.accountId);
      const template = await this.s3Service.getTemplate(data.templateId);
    } catch (error) {
      throw new ValueError(`Failed to send mail to ${data.recipient} with job id ${id}: ${error}`);
    }
    return;
  }
}
