import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';

export interface IReelIndexRetryPublisher {
  publishRetry(job: ReelIndexJob, retryNumber: 1 | 2): Promise<void>;
}
