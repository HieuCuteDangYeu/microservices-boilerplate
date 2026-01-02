import { CreatePaymentDto } from '@common/payment/dtos/create-payment.dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Payment } from '../../domain/entities/payment.entity';
import type { IPaymentGateway } from '../../domain/interfaces/payment-gateway.interface';
import type { IPaymentRepository } from '../../domain/interfaces/payment.repository.interface';

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    @Inject('IPaymentRepository')
    private readonly paymentRepository: IPaymentRepository,
    @Inject('IPaymentGateway') private readonly paymentGateway: IPaymentGateway,
  ) {}

  async execute(userId: string, dto: CreatePaymentDto) {
    const gatewayResponse = await this.paymentGateway.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency,
      userId,
    });

    const payment = new Payment(
      randomUUID(),
      userId,
      dto.amount,
      dto.currency,
      'PENDING',
      'stripe',
      gatewayResponse.providerId,
      new Date(),
      new Date(),
    );

    await this.paymentRepository.save(payment);

    return {
      clientSecret: gatewayResponse.clientSecret,
      paymentId: payment.id,
    };
  }
}
