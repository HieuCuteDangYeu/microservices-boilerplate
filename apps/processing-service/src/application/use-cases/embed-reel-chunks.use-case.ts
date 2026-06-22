import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { BuiltTranscriptChunk } from '@common/conversation/interfaces/built-transcript-chunk.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import { BuildReelEmbeddingTextUseCase } from './build-reel-embedding-text.use-case';

@Injectable()
export class EmbedReelChunksUseCase {
  private readonly logger = new Logger(EmbedReelChunksUseCase.name);

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
    private readonly buildReelEmbeddingTextUseCase: BuildReelEmbeddingTextUseCase,
  ) {}

  async execute(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    chunks: BuiltTranscriptChunk[];
  }): Promise<ReelChunkIndexInput[]> {
    const indexedChunks: ReelChunkIndexInput[] = [];

    for (let index = 0; index < data.chunks.length; index++) {
      const chunk = data.chunks[index];

      const embeddingDocument = this.buildReelEmbeddingTextUseCase.execute(
        data,
        chunk,
      );

      try {
        const embedding = await this.aiService.generateEmbedding({
          text: embeddingDocument.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          title: embeddingDocument.title,
        });

        indexedChunks.push({
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
          `[Reel ${data.reelId}] Failed to embed ${chunk.type} chunk ${index}: ${message}`,
          stack,
        );
      }
    }

    return indexedChunks;
  }
}
