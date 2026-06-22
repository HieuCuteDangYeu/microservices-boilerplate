import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Injectable } from '@nestjs/common';
import { BuildTranscriptChunksUseCase } from './build-transcript-chunks.use-case';
import { EmbedReelChunksUseCase } from './embed-reel-chunks.use-case';

@Injectable()
export class BuildReelSearchIndexUseCase {
  constructor(
    private readonly buildTranscriptChunksUseCase: BuildTranscriptChunksUseCase,
    private readonly embedReelChunksUseCase: EmbedReelChunksUseCase,
  ) {}

  async execute(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<ReelChunkIndexInput[]> {
    const builtChunks = await this.buildTranscriptChunksUseCase.execute({
      title: data.title,
      description: data.description,
      tags: data.tags,
      transcript: data.transcript,
      transcriptSegments: data.transcriptSegments,
    });

    return this.embedReelChunksUseCase.execute({
      reelId: data.reelId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      chunks: builtChunks,
    });
  }
}
