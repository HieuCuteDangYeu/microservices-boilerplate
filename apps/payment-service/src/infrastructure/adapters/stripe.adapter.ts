import { CreatePaymentParams } from '@common/payment/interfaces/create-payment-params.interface';
import { PaymentGatewayResponse } from '@common/payment/interfaces/payment-gateway-response.interface';
import { PaymentWebhookEvent } from '@common/payment/interfaces/payment-webhook-event.interface';
import { Injectable, Logger } from '@nestjs/common';
import { InvalidWebhookSignatureError } from '@payment/domain/errors/payment.errors';
import Stripe from 'stripe';
import { IPaymentGateway } from '../../domain/interfaces/payment-gateway.interface';

@Injectable()
export class StripeAdapter implements IPaymentGateway {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeAdapter.name);

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
  }

  async createPaymentIntent(
    params: CreatePaymentParams,
  ): Promise<PaymentGatewayResponse> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: Math.round(params.amount),
        currency: params.currency,
        metadata: {
          userId: params.userId,
          ...params.metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      if (!intent.client_secret) {
        throw new Error('Stripe failed to return a client_secret');
      }

      return {
        providerId: intent.id,
        clientSecret: intent.client_secret,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create payment intent: ${
          error instanceof Error ? error.message : error
        }`,
      );
      throw new Error('Failed to initialize payment with provider');
    }
  }

  constructEventFromPayload(
    signature: string,
    payload: Buffer,
  ): Promise<PaymentWebhookEvent> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      return Promise.resolve({
        id: event.id,
        type: event.type,
        data: event.data.object as Record<string, any>,
      });
    } catch (error) {
      this.logger.error(
        `Webhook signature verification failed: ${
          error instanceof Error ? error.message : error
        }`,
      );

      throw new InvalidWebhookSignatureError();
    }
  }
}
