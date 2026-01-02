import { Injectable } from '@nestjs/common';
import { Payment as PrismaPayment } from '@prisma/payment-client';
import { Payment } from '../../domain/entities/payment.entity';
import { IPaymentRepository } from '../../domain/interfaces/payment.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(payment: Payment): Promise<Payment> {
    const saved = await this.prisma.payment.create({
      data: {
        id: payment.id,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        providerId: payment.providerId,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });

    return this.toDomain(saved);
  }

  async findById(id: string): Promise<Payment | null> {
    const found = await this.prisma.payment.findUnique({
      where: { id },
    });

    return found ? this.toDomain(found) : null;
  }

  async findByProviderId(providerId: string): Promise<Payment | null> {
    const found = await this.prisma.payment.findUnique({
      where: { providerId },
    });

    return found ? this.toDomain(found) : null;
  }

  async updateStatus(
    id: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: { status },
    });
  }

  private toDomain(prismaPayment: PrismaPayment): Payment {
    return new Payment(
      prismaPayment.id,
      prismaPayment.userId,
      prismaPayment.amount,
      prismaPayment.currency,
      prismaPayment.status,
      prismaPayment.provider,
      prismaPayment.providerId,
      prismaPayment.createdAt,
      prismaPayment.updatedAt,
    );
  }
}
