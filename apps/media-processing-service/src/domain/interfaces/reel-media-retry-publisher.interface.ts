import type { ReelMediaJob } from '@common/processing/interfaces/reel-media-job.interface';

export interface IReelMediaRetryPublisher {
  publishRetry(job: ReelMediaJob, retryNumber: 1 | 2): Promise<void>;
}
