import { SendMailDto } from '@common/mail/dtos/send-mail.dto';
import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { SendMailUseCase } from '../../application/use-cases/send-mail.use-case';

@Controller()
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly sendMailUseCase: SendMailUseCase) {}

  @EventPattern('mail.send')
  async handleMailSend(
    @Payload() data: SendMailDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as Channel;
    const originalMsg = context.getMessage() as Message;

    try {
      this.logger.log(`Received mail.send event for: ${data.to}`);

      await this.sendMailUseCase.execute(data);

      this.logger.log(`Successfully processed email to: ${data.to}`);

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to process mail for: ${data.to}`, error);
      channel.nack(originalMsg, false, false);
    }
  }
}
