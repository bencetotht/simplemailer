import { Controller } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { Ctx } from '@nestjs/microservices';

@Controller()
export class QueueController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern('mail.send')
  public async execute(@Payload() data: any, @Ctx() context: RmqContext) {
      const channel = context.getChannelRef();
      const orginalMessage = context.getMessage();

      console.log('data', data);

      channel.ack(orginalMessage);
  }
}
