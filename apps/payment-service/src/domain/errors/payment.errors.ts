export class InvalidWebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'InvalidWebhookSignatureError';
  }
}
