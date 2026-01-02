import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { InvalidWebhookSignatureError } from '@payment/domain/errors/payment.errors';
import type { Request } from 'express';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import type { IPaymentGateway } from '../../domain/interfaces/payment-gateway.interface';

export interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@Controller('payments/webhook')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    @Inject('IPaymentGateway') private readonly paymentGateway: IPaymentGateway,
    private readonly handleWebhookUseCase: HandlePaymentWebhookUseCase,
  ) {}

  @Post()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: Request,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = (request as RequestWithRawBody).rawBody;
    if (!rawBody) {
      this.logger.error('Raw body is missing');
      throw new InternalServerErrorException('Server configuration error');
    }

    try {
      const event = await this.paymentGateway.constructEventFromPayload(
        signature,
        rawBody,
      );

      await this.handleWebhookUseCase.execute(event);

      return { received: true };
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new BadRequestException(error.message);
      }

      this.logger.error(error);
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }
}
