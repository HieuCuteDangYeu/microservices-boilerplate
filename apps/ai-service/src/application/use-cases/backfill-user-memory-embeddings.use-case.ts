import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type { IUserMemoryRepository } from '@ai/domain/interfaces/user-memory.repository.interface';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

export interface BackfillUserMemoryEmbeddingsResult {
  scanned: number;
  updated: number;
  failed: number;
}

@Injectable()
export class BackfillUserMemoryEmbeddingsUseCase {
  private readonly logger = new Logger(
    BackfillUserMemoryEmbeddingsUseCase.name,
  );

  constructor(
    @Inject('IAiApplicationConfig')
    private readonly configService: IAiApplicationConfig,

    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,

    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(input?: {
    limit?: number;
  }): Promise<BackfillUserMemoryEmbeddingsResult> {
    const limit = this.normalizeLimit(input?.limit ?? 100, 1, 500);
    const memories =
      await this.userMemoryRepository.findWithoutEmbedding(limit);

    let updated = 0;
    let failed = 0;

    for (const memory of memories) {
      if (!memory.id) {
        continue;
      }

      try {
        const embedding = await this.embeddingService.generateVector({
          text: this.buildMemoryEmbeddingText({
            type: memory.type,
            content: memory.content,
          }),
          taskType: 'RETRIEVAL_DOCUMENT',
          title: 'User memory',
        });

        const expectedDimensions = this.getExpectedEmbeddingDimensions();

        if (embedding.dimensions !== expectedDimensions) {
          failed += 1;

          this.logger.warn(
            `[UserMemoryBackfill] skipped memoryId=${memory.id} dimensions=${embedding.dimensions}, expected=${expectedDimensions}`,
          );

          continue;
        }

        await this.userMemoryRepository.updateEmbedding({
          memoryId: memory.id,
          embedding: embedding.values,
          embeddingModel: `${embedding.model}:${embedding.dimensions}`,
        });

        updated += 1;
      } catch (error: unknown) {
        failed += 1;

        const message = error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `[UserMemoryBackfill] failed memoryId=${memory.id}: ${message}`,
        );
      }
    }

    return {
      scanned: memories.length,
      updated,
      failed,
    };
  }

  private buildMemoryEmbeddingText(input: {
    type: UserMemoryType;
    content: string;
  }): string {
    return [
      `Memory type: ${input.type}`,
      `Memory content: ${input.content.trim()}`,
    ].join('\n');
  }

  private getExpectedEmbeddingDimensions(): number {
    const value = Number(
      this.configService.get<string>('AI_USER_MEMORY_EMBEDDING_DIMENSIONS') ??
        this.configService.get<string>('GEMINI_EMBEDDING_DIMENSIONS') ??
        '384',
    );

    return Number.isFinite(value) && value > 0 ? Math.round(value) : 384;
  }

  private normalizeLimit(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(Math.max(Math.floor(value), min), max);
  }
}
