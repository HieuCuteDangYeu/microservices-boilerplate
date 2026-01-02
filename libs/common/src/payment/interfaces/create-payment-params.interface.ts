export interface CreatePaymentParams {
  amount: number;
  currency: string;
  userId: string;
  metadata?: Record<string, string>;
}
