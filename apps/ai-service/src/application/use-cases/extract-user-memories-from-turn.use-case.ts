import type { ExtractUserMemoriesRequest } from '@common/ai/interfaces/extract-user-memory.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';

@Injectable()
export class ExtractUserMemoriesFromTurnUseCase {
  constructor(
    @Inject('IMemoryExtractorService')
    private readonly memoryExtractorService: IMemoryExtractorService,
  ) {}

  async execute(input: ExtractUserMemoriesRequest) {
    return await this.memoryExtractorService.extract(input);
  }
}
