import { SendMailDto } from '@common/mail/dtos/send-mail.dto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SendMailUseCase } from '../../application/use-cases/send-mail.use-case';

@Processor('mail_queue')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly sendMailUseCase: SendMailUseCase) {
    super();
  }

  async process(job: Job<SendMailDto>): Promise<void> {
    this.logger.log(`Processing job ${job.id} for ${job.data.to}...`);

    await this.sendMailUseCase.execute(job.data);
  }
}
