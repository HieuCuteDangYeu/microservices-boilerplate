import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';

export interface IPersistedSemanticCandidateValidator {
  execute(input: {
    job: ReelIndexJob;
    documents: ReelIndexDocument[];
    transcriptSegmentCount: number;
  }): Promise<void>;
}
