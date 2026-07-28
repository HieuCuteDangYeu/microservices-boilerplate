import {
  CreateNotificationJobInput,
  NotificationJob,
} from '../entities/notification-job.entity';

export abstract class INotificationJobRepository {
  abstract create(input: CreateNotificationJobInput): Promise<NotificationJob>;
  abstract markProcessing(id: string): Promise<NotificationJob>;
  abstract markSent(id: string): Promise<NotificationJob>;
  abstract markFailed(
    id: string,
    error: string,
    nextAttemptAt?: Date,
  ): Promise<NotificationJob>;
  abstract markSkipped(id: string, reason: string): Promise<NotificationJob>;
  abstract findRetryable(limit: number): Promise<NotificationJob[]>;
}
