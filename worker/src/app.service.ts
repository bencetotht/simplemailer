import { Injectable } from '@nestjs/common';
import { MailJob } from './interfaces/mail';

@Injectable()
export class AppService {
  async sendMail(data: MailJob): Promise<void> {
    return;
  }
}
