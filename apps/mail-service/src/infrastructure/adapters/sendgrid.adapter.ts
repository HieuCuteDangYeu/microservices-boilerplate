import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { IMailSender } from '../../domain/interfaces/mail-sender.interface';

@Injectable()
export class SendGridAdapter implements IMailSender {
  private readonly logger = new Logger(SendGridAdapter.name);

  constructor(private readonly config: ConfigService) {
    sgMail.setApiKey(this.config.get<string>('SENDGRID_API_KEY')!);
  }

  async send(
    to: string,
    subject: string,
    template: string,
    context: any,
  ): Promise<void> {
    const msg: MailDataRequired = {
      to,
      from: this.config.get<string>('SENDGRID_FROM_EMAIL')!,
      subject,
      templateId: template,
      dynamicTemplateData: context as Record<string, unknown>,
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`SendGrid Email sent to ${to}`);
    } catch (error) {
      this.logger.error('Error sending email via SendGrid', error);
      const sgError = error as { response?: { body: unknown } };
      if (sgError.response) {
        console.error(sgError.response.body);
      }
      throw error;
    }
  }
}
