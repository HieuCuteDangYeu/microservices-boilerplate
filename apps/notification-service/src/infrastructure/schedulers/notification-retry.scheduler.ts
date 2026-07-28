import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RetryNotificationJobsUseCase } from '../../application/use-cases/retry-notification-jobs.use-case';

@Injectable()
export class NotificationRetryScheduler {
  private readonly logger = new Logger(NotificationRetryScheduler.name);

  constructor(
    private readonly retryNotificationJobs: RetryNotificationJobsUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetries() {
    const result = await this.retryNotificationJobs.execute(20);

    if (result.attemptedCount === 0) {
      return;
    }

    this.logger.log(`Retried ${result.attemptedCount} notification job(s)`);

    for (const failure of result.failures) {
      this.logger.error(
        `Failed to retry notification job ${failure.jobId}`,
        failure.error,
      );
    }
  }
}
