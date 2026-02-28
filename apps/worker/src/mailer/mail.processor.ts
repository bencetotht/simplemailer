import { Controller } from '@nestjs/common';
import { MailService } from './mail.service';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';

@Controller()
export class MailProcessor {
  constructor(private readonly mailService: MailService) {}

  @MessagePattern('mail.send')
  public async execute(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const orginalMessage = context.getMessage();

    console.log('data', data);

    channel.ack(orginalMessage);
  }
}
