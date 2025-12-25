import { SendMailDto } from '@common/mail/dtos/send-mail.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Queue } from 'bullmq';

@Controller()
export class MailController {
  constructor(@InjectQueue('mail_queue') private readonly mailQueue: Queue) {}

  @EventPattern('mail.send')
  async handleSendMail(@Payload() data: SendMailDto) {
    console.log(`Received request to email: ${data.to}`);

    await this.mailQueue.add('send_email', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
    });
  }
}
