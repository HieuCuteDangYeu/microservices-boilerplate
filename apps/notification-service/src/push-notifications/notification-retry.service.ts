import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationJobsService } from '../notification-jobs/notification-jobs.service';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class NotificationRetryService {
  private readonly logger = new Logger(NotificationRetryService.name);

  constructor(
    private readonly notificationJobsService: NotificationJobsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetries() {
    const jobs = await this.notificationJobsService.findRetryableJobs(20);

    if (jobs.length === 0) {
      return;
    }

    this.logger.log(`Retrying ${jobs.length} notification job(s)`);

    for (const job of jobs) {
      try {
        await this.pushNotificationsService.retryJob(job);
      } catch (error) {
        this.logger.error(`Failed to retry notification job ${job.id}`, error);
      }
    }
  }
}
