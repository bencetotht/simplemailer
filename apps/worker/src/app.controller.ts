import { Controller, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { Ctx } from '@nestjs/microservices';
import { MailJob } from './interfaces/mail';
import { PrismaService } from './prisma.service';
import { DbService } from './db.service';
import { Status } from 'database';
import { ValueError } from './value.error';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);
  constructor(private readonly appService: AppService, private readonly dbService: DbService) {}

  @MessagePattern('mail.send')
  public async execute(@Payload() data: MailJob, @Ctx() context: RmqContext) {
      const channel = context.getChannelRef();
      const orginalMessage = context.getMessage();

      if (!data.accountId || !data.templateId || !data.recipient || !data.values) {
        this.logger.error('Invalid data: missing required fields');
        channel.nack(orginalMessage, false, false);
        return;
      }

      const db = await this.dbService.createLog(data);
      this.logger.log(`Sending mail to ${data.recipient} with job id ${db.id}`);

      try{
        const result = await this.appService.sendMail(db.id, data);
      } catch (error) {
        if (error instanceof ValueError) {
          this.logger.error(`Failed to send mail to ${data.recipient} with job id ${db.id}: ${error.message}`);
          channel.nack(orginalMessage, false, false); // fail & don't requeue the message
        } else {
          this.logger.warn(`Failed to send mail to ${data.recipient} with job id ${db.id}, retrying...: ${error}`);
          channel.nack(orginalMessage, false, true); // fail & requeue the message
        }
        await this.dbService.updateLogStatus(db.id, Status.FAILED);
      } finally {
        this.logger.log(`Mail sent to ${data.recipient} with job id ${db.id}`);
        channel.ack(orginalMessage);
        await this.dbService.updateLogStatus(db.id, Status.SENT);
      }
  }
}
