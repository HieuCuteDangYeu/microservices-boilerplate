import { CreatePaymentParams } from '@common/payment/interfaces/create-payment-params.interface';
import { PaymentGatewayResponse } from '@common/payment/interfaces/payment-gateway-response.interface';
import { PaymentWebhookEvent } from '@common/payment/interfaces/payment-webhook-event.interface';

export interface IPaymentGateway {
  createPaymentIntent(
    params: CreatePaymentParams,
  ): Promise<PaymentGatewayResponse>;
  constructEventFromPayload(
    signature: string,
    payload: Buffer,
  ): Promise<PaymentWebhookEvent>;
}
