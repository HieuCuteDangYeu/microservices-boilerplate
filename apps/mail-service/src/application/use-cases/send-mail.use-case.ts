import { SendMailDto } from '@common/mail/dtos/send-mail.dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IMailSender } from '../../domain/interfaces/mail-sender.interface';
import { MailRepository } from '../../infrastructure/repositories/mail.repository';

@Injectable()
export class SendMailUseCase {
  private readonly logger = new Logger(SendMailUseCase.name);

  constructor(
    private readonly mailRepository: MailRepository,
    @Inject('IMailSender') private readonly mailSender: IMailSender,
  ) {}

  async execute(dto: SendMailDto): Promise<void> {
    const { to, subject, template, context } = dto;

    try {
      await this.mailSender.send(to, subject, template, context);

      await this.mailRepository.createLog({
        to,
        subject,
        template,
        status: 'SENT',
      });

      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send to ${to}`, error);

      await this.mailRepository.createLog({
        to,
        subject,
        template,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}
