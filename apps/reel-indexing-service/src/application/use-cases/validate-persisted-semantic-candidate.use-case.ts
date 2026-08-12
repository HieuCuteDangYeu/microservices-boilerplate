import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { ISemanticCandidateInspector } from '@indexing/domain/interfaces/semantic-candidate-inspector.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ValidatePersistedSemanticCandidateUseCase {
  constructor(
    @Inject('ISemanticCandidateInspector')
    private readonly inspector: ISemanticCandidateInspector,
  ) {}

  async execute(input: {
    job: ReelIndexJob;
    documents: ReelIndexDocument[];
    transcriptSegmentCount: number;
  }): Promise<void> {
    const expected = {
      reelDocumentCount: input.documents.filter((item) => item.kind === 'REEL')
        .length,
      sectionCount: input.documents.filter((item) => item.kind === 'SECTION')
        .length,
      chunkCount: input.documents.filter((item) => item.kind === 'CHUNK').length,
      visualSceneCount: input.documents.filter(
        (item) => item.kind === 'VISUAL_SCENE',
      ).length,
      transcriptSegmentCount: input.transcriptSegmentCount,
    };

    const actual = await this.inspector.getSnapshot({
      reelId: input.job.reelId,
      indexAttemptId: input.job.indexAttemptId,
    });

    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (actual[key] !== expected[key]) {
        throw new Error(
          `Persisted semantic candidate integrity mismatch for ${key}; expected=${expected[key]} actual=${actual[key]}`,
        );
      }
    }

    if (actual.reelDocumentCount !== 1) {
      throw new Error('Persisted semantic candidate must contain exactly one REEL document');
    }

    if (actual.activeDocumentCount !== 0) {
      throw new Error(
        `Persisted semantic candidate unexpectedly contains ${actual.activeDocumentCount} active documents before commit`,
      );
    }
  }
}
