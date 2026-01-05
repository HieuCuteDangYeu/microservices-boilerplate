import { SendMailUseCase } from '@mail/application/use-cases/send-mail.use-case';
import { SendGridAdapter } from '@mail/infrastructure/adapters/sendgrid.adapter';
import { MailController } from '@mail/infrastructure/controllers/mail.controller';
import { MailProcessor } from '@mail/infrastructure/queue/mail.processor';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('MAIL_QUEUE_HOST'),
          port: config.get<number>('MAIL_QUEUE_PORT'),
          password: config.get('MAIL_QUEUE_PASSWORD'),
          tls: (config.get<string>('MAIL_QUEUE_HOST') ?? '').includes('upstash')
            ? { servername: config.get('MAIL_QUEUE_HOST') }
            : undefined,
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'mail_queue',
    }),
  ],
  controllers: [MailController],
  providers: [
    MailProcessor,
    SendMailUseCase,
    {
      provide: 'IMailSender',
      useClass: SendGridAdapter,
    },
  ],
})
export class MailServiceModule {}
