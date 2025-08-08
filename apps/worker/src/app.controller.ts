import { Controller, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { Ctx } from '@nestjs/microservices';
import { MailJob } from './interfaces/mail';
import { PrismaService } from './prisma.service';
import { DbService } from './db.service';
import { Status } from 'database';
import { ValueError } from './value.error';
import { MailService } from './mailer/mail.service';
import { TemplateService } from './mailer/template.service';
import { MailerError, MailerMaxRetriesError } from './mailer/mailer.error';
import { QueueService } from './queue.service';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);
  constructor(private readonly appService: AppService, private readonly dbService: DbService, private readonly mailService: MailService, private readonly queueService: QueueService) {}

  @MessagePattern('mail.send')
  public async execute(@Payload() data: MailJob, @Ctx() context: RmqContext) {
      const channel = context.getChannelRef();
      const orginalMessage = context.getMessage();

      if (!data.accountId || !data.templateId || !data.recipient || !data.values) { // if any of the required fields are missing, fail & don't requeue the message
        this.logger.error('Invalid data: missing required fields');
        channel.nack(orginalMessage, false, false);
        return;
      }

      // validate account & template
      try {
        await this.appService.validateMaildata(data);
      } catch (error) {
        this.logger.error(`Error validating mail data: ${error.message}`);
        channel.nack(orginalMessage, false, false); // fail & don't requeue the message
        return;
      }

      // check if the message is a retry
      const isRetry = orginalMessage.properties.headers.retryCount ? true : false;

      const db = isRetry 
        ? await this.dbService.updateLogStatus(orginalMessage.properties.headers.dbId, Status.RETRYING)
        : await this.dbService.createLog(data);
      if (!isRetry) this.logger.log(`Sending mail to ${data.recipient} with job id ${db.id}`);

      try{
        const account = await this.dbService.getCredentials(data.accountId);
        const template = await this.dbService.getTemplate(data.templateId);
        await this.mailService.sendMail(account, template, data);
        
        channel.ack(orginalMessage);
        await this.dbService.updateLogStatus(db.id, Status.SENT);
        this.logger.log(`Mail sent to ${data.recipient} with job id ${db.id}`);
      } catch (error) {
        if (error instanceof MailerError) { // if the error is a mailer error, retry the mail
          try {
            const {retryCount, maxRetries} = await this.queueService.handleFailedJob(channel, data, orginalMessage, error, db.id);
            this.logger.warn(`Failed to send mail to ${data.recipient} with job id ${db.id}, retrying ${retryCount}/${maxRetries}: ${error}`);
            await this.dbService.updateLogStatus(db.id, Status.RETRYING);
          } catch (error) { 
            if (error instanceof MailerMaxRetriesError) { // if maximum retries are exhausted, update the status to failed
              this.logger.error(`Failed to send mail to ${data.recipient} with job id ${db.id}: ${error.message}`);
              await this.dbService.updateLogStatus(db.id, Status.FAILED);
            }
            else {
              throw error;
            }
          }
        }
        else {
          this.logger.error(`Failed to send mail to ${data.recipient} with job id ${db.id}: ${error.message}`);
          channel.nack(orginalMessage, false, false); // fail & don't requeue the message
          await this.dbService.updateLogStatus(db.id, Status.FAILED);
        }
      }
  }
}
