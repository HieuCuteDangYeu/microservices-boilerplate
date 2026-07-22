import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { BuiltTranscriptChunk } from '@common/conversation/interfaces/built-transcript-chunk.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import { BuildReelEmbeddingTextUseCase } from './build-reel-embedding-text.use-case';

export interface ReelChunkEmbeddingMetrics {
  requestCount: number;
  totalItemCount: number;
  failedRequestCount: number;
}

export interface ReelChunkEmbeddingResult {
  chunks: ReelChunkIndexInput[];
  metrics: ReelChunkEmbeddingMetrics;
}

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
    return (await this.executeWithMetrics(data)).chunks;
  }

  async executeWithMetrics(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    chunks: BuiltTranscriptChunk[];
  }): Promise<ReelChunkEmbeddingResult> {
    const indexedChunks: ReelChunkIndexInput[] = [];
    const metrics: ReelChunkEmbeddingMetrics = {
      requestCount: 0,
      totalItemCount: 0,
      failedRequestCount: 0,
    };

    for (let index = 0; index < data.chunks.length; index++) {
      const chunk = data.chunks[index];

      const embeddingDocument = this.buildReelEmbeddingTextUseCase.execute(
        data,
        chunk,
      );

      try {
        metrics.requestCount += 1;
        metrics.totalItemCount += 1;

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
        metrics.failedRequestCount += 1;
        const { message, stack } = formatProcessingError(error);

        this.logger.warn(
          `[Reel ${data.reelId}] Failed to embed ${chunk.type} chunk ${index}: ${message}`,
          stack,
        );
      }
    }

    return { chunks: indexedChunks, metrics };
  }
}
