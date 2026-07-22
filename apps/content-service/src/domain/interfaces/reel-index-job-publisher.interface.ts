import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';

export interface IReelIndexJobPublisher {
  publish(job: ReelIndexJob): Promise<void>;
}
