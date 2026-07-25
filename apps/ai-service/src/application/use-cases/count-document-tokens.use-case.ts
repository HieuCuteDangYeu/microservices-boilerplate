import type {
  CountDocumentTokensRequest,
  CountDocumentTokensResult,
} from '@common/ai/interfaces/count-document-tokens.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CountDocumentTokensUseCase {
  constructor(
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(
    input: CountDocumentTokensRequest,
  ): Promise<CountDocumentTokensResult> {
    const items = await Promise.all(
      input.items.map(async (item) => ({
        id: item.id,
        tokenCount: await this.embeddingService.countTokens(
          input.model,
          item.text,
        ),
      })),
    );
    return { items };
  }
}
