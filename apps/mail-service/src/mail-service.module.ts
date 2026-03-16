import { SendMailUseCase } from '@mail/application/use-cases/send-mail.use-case';
import { ResendAdapter } from '@mail/infrastructure/adapters/resend.adapter';
import { MailController } from '@mail/infrastructure/controllers/mail.controller';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  controllers: [MailController],
  providers: [
    SendMailUseCase,
    {
      provide: 'IMailSender',
      useClass: ResendAdapter,
    },
  ],
})
export class MailServiceModule {}
