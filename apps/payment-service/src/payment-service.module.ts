import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreatePaymentUseCase } from '@payment/application/use-cases/create-payment.use-case';
import { HandlePaymentWebhookUseCase } from '@payment/application/use-cases/handle-payment-webhook.use-case';
import { StripeAdapter } from '@payment/infrastructure/adapters/stripe.adapter';
import { PaymentWebhookController } from '@payment/infrastructure/controllers/payment-webhook.controller';
import { PrismaService } from '@payment/infrastructure/prisma/prisma.service';
import { PaymentRepository } from '@payment/infrastructure/repositories/payment.repository';
import { PaymentController } from './infrastructure/controllers/payment.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [
    PrismaService,
    {
      provide: 'IPaymentGateway',
      useClass: StripeAdapter,
    },
    {
      provide: 'IPaymentRepository',
      useClass: PaymentRepository,
    },
    CreatePaymentUseCase,
    HandlePaymentWebhookUseCase,
  ],
})
export class PaymentServiceModule {}
