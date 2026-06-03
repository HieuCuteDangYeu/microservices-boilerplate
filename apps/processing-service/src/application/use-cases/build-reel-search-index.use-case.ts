import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import { BuildReelEmbeddingTextUseCase } from './build-reel-embedding-text.use-case';
import { BuildTranscriptChunksUseCase } from './build-transcript-chunks.use-case';

@Injectable()
export class BuildReelSearchIndexUseCase {
  private readonly logger = new Logger(BuildReelSearchIndexUseCase.name);

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
    private readonly buildTranscriptChunksUseCase: BuildTranscriptChunksUseCase,
    private readonly buildReelEmbeddingTextUseCase: BuildReelEmbeddingTextUseCase,
  ) {}

  async execute(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<ReelChunkIndexInput[]> {
    const builtChunks = this.buildTranscriptChunksUseCase.execute({
      title: data.title,
      description: data.description,
      tags: data.tags,
      transcript: data.transcript,
      transcriptSegments: data.transcriptSegments,
    });

    const chunks: ReelChunkIndexInput[] = [];

    for (let index = 0; index < builtChunks.length; index++) {
      const chunk = builtChunks[index];
      const embeddingDocument = this.buildReelEmbeddingTextUseCase.execute(
        data,
        chunk.text,
      );

      try {
        const embedding = await this.aiService.generateEmbedding({
          text: embeddingDocument.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          title: embeddingDocument.title,
        });

        chunks.push({
          chunkIndex: index,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          embedding: embedding.values,
          embeddingModel: `${embedding.model}:${embedding.dimensions}`,
        });
      } catch (error: unknown) {
        const { message, stack } = formatProcessingError(error);

        this.logger.warn(
          `[Reel ${data.reelId}] Failed to embed chunk ${index}: ${message}`,
          stack,
        );
      }
    }

    return chunks;
  }
}
