import { CreatePaymentDto } from '@common/payment/dtos/create-payment.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { CreatePaymentUseCase } from '../../application/use-cases/create-payment.use-case';

@Controller()
export class PaymentController {
  constructor(private readonly createPaymentUseCase: CreatePaymentUseCase) {}

  @MessagePattern('payment.create')
  async create(@Payload() data: { userId: string; dto: CreatePaymentDto }) {
    try {
      return await this.createPaymentUseCase.execute(data.userId, data.dto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Payment creation failed';

      throw new RpcException({
        statusCode: 500,
        message,
      });
    }
  }
}
