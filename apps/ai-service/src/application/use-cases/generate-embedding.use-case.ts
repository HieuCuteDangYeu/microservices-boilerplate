import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';

@Injectable()
export class GenerateEmbeddingUseCase {
  constructor(
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(input: GenerateEmbeddingRequest): Promise<number[]> {
    return await this.embeddingService.generateVector(input);
  }
}
