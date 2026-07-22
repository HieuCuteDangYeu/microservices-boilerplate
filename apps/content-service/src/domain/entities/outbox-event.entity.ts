export class OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  publishedAt?: Date;
  attemptCount: number;
  nextAttemptAt: Date;
  claimToken?: string;
  claimedAt?: Date;
  lastError?: string;
}
