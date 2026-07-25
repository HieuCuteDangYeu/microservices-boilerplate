import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { BuildShortEvidenceChunksUseCase } from '@indexing/application/use-cases/build-short-evidence-chunks.use-case';
import type { EvidenceChunk } from '@indexing/domain/entities/evidence-chunk.entity';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import { Injectable } from '@nestjs/common';

export interface SectionEvidenceChunk extends EvidenceChunk {
  sectionIndex: number;
}

@Injectable()
export class BuildLongEvidenceChunksUseCase {
  constructor(private readonly buildChunks: BuildShortEvidenceChunksUseCase) {}

  execute(
    sections: TranscriptSection[],
    segments: TranscriptSegment[],
  ): SectionEvidenceChunk[] {
    return sections.flatMap((section) => {
      const sectionSegments = segments.filter(
        (segment) =>
          segment.start * 1000 >= section.startMs &&
          segment.start * 1000 < section.endMs,
      );
      return this.buildChunks
        .execute(sectionSegments, 'INDEX_LONG_CHUNK')
        .map((chunk) => ({ ...chunk, sectionIndex: section.index }));
    });
  }
}
