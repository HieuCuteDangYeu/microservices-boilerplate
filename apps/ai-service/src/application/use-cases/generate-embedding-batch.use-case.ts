import type {
  GenerateEmbeddingBatchRequest,
  GenerateEmbeddingBatchResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';

@Injectable()
export class GenerateEmbeddingBatchUseCase {
  constructor(
    private readonly configService: ConfigService,
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(
    input: GenerateEmbeddingBatchRequest,
  ): Promise<GenerateEmbeddingBatchResult> {
    const embeddings: GenerateEmbeddingBatchResult['embeddings'] = [];
    const errors: GenerateEmbeddingBatchResult['errors'] = [];
    let cursor = 0;
    const concurrency = this.getConcurrency();
    const workers = Array.from(
      { length: Math.min(concurrency, input.items.length) },
      async () => {
        while (cursor < input.items.length) {
          const item = input.items[cursor++];
          try {
            const result = await this.embeddingService.generateVector({
              text: item.text,
              taskType: item.taskType,
              title: item.title,
            });
            embeddings.push({ id: item.id, ...result });
          } catch (error: unknown) {
            errors.push({
              id: item.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      },
    );
    await Promise.all(workers);

    const order = new Map(input.items.map((item, index) => [item.id, index]));
    embeddings.sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
    errors.sort((left, right) => order.get(left.id)! - order.get(right.id)!);
    return { embeddings, errors };
  }

  private getConcurrency(): number {
    const parsed = Number(
      this.configService.get<string>('AI_EMBEDDING_BATCH_CONCURRENCY') ?? '4',
    );
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 16) : 4;
  }
}
