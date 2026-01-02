import { PaymentWebhookEvent } from '@common/payment/interfaces/payment-webhook-event.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IPaymentRepository } from '../../domain/interfaces/payment.repository.interface';

@Injectable()
export class HandlePaymentWebhookUseCase {
  private readonly logger = new Logger(HandlePaymentWebhookUseCase.name);

  constructor(
    @Inject('IPaymentRepository')
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(event: PaymentWebhookEvent): Promise<void> {
    const stripePaymentId = event.data['id'] as string;

    this.logger.log(
      `Received Webhook Event: ${event.type} for ${stripePaymentId}`,
    );

    const payment =
      await this.paymentRepository.findByProviderId(stripePaymentId);

    if (!payment) {
      this.logger.warn(
        `Payment intent ${stripePaymentId} not found in database. Ignoring event.`,
      );
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handleSuccess(payment.id, payment.status);
        break;

      case 'payment_intent.payment_failed':
        await this.handleFailure(
          payment.id,
          payment.status,
          event.data['last_payment_error'] as Record<string, any> | null,
        );
        break;

      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleSuccess(paymentId: string, currentStatus: string) {
    if (currentStatus === 'COMPLETED') {
      this.logger.log(`Payment ${paymentId} is already COMPLETED. Skipping.`);
      return;
    }

    await this.paymentRepository.updateStatus(paymentId, 'COMPLETED');
    this.logger.log(`Payment ${paymentId} marked as COMPLETED`);
  }

  private async handleFailure(
    paymentId: string,
    currentStatus: string,
    errorData: Record<string, any> | null,
  ) {
    if (currentStatus === 'FAILED') {
      this.logger.log(`Payment ${paymentId} is already FAILED. Skipping.`);
      return;
    }

    await this.paymentRepository.updateStatus(paymentId, 'FAILED');

    const reason = (errorData?.message as string) ?? 'Unknown reason';

    this.logger.error(`Payment ${paymentId} FAILED. Reason: ${reason}`);
  }
}
