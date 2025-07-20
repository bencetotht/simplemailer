import { Controller, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { Ctx } from '@nestjs/microservices';
import { MailJob } from './interfaces/mail';
import { PrismaService } from './prisma.service';

@Controller()
export class QueueController {
  private readonly logger = new Logger(QueueController.name);
  constructor(private readonly appService: AppService, private readonly prisma: PrismaService) {}

  @MessagePattern('mail.send')
  public async execute(@Payload() data: MailJob, @Ctx() context: RmqContext) {
      const channel = context.getChannelRef();
      const orginalMessage = context.getMessage();

      const db = await this.dbService.createEvent()
      this.logger.log(`Sending mail to ${data.recipient} with job id ${db.id}`);

      try{
        const result = await this.appService.sendMail(data);
      } catch (error) {
        // TODO: log error
        console.error(error);
        channel.nack(orginalMessage, false, true); // fail & requeue the message
      } finally {
        channel.ack(orginalMessage);
      }
  }
}
