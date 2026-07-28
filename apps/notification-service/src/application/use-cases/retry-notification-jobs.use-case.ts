import { Inject, Injectable } from '@nestjs/common';

import { INotificationJobRepository } from '../../domain/interfaces/notification-job.repository.interface';
import { ProcessNotificationJobUseCase } from './process-notification-job.use-case';

export type NotificationRetryFailure = {
  jobId: string;
  error: unknown;
};

@Injectable()
export class RetryNotificationJobsUseCase {
  constructor(
    @Inject('INotificationJobRepository')
    private readonly notificationJobRepository: INotificationJobRepository,
    private readonly processNotificationJob: ProcessNotificationJobUseCase,
  ) {}

  async execute(limit: number): Promise<{
    attemptedCount: number;
    failures: NotificationRetryFailure[];
  }> {
    const jobs = await this.notificationJobRepository.findRetryable(limit);
    const failures: NotificationRetryFailure[] = [];

    for (const job of jobs) {
      try {
        await this.processNotificationJob.execute(job);
      } catch (error) {
        failures.push({ jobId: job.id, error });
      }
    }

    return {
      attemptedCount: jobs.length,
      failures,
    };
  }
}
