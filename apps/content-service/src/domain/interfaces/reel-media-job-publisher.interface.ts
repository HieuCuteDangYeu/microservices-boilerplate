import type { ReelMediaJob } from '@common/processing/interfaces/reel-media-job.interface';

export interface IReelMediaJobPublisher {
  publish(job: ReelMediaJob): Promise<void>;
}
