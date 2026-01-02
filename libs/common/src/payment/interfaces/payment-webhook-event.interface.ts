export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: Record<string, any>;
}
