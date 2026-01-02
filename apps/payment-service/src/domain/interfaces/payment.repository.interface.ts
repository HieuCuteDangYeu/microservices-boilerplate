import { Payment } from '../entities/payment.entity';

export interface IPaymentRepository {
  save(payment: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByProviderId(providerId: string): Promise<Payment | null>;
  updateStatus(
    id: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED',
  ): Promise<void>;
}
