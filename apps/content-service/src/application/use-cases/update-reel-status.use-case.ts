import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class UpdateReelStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
  ) {
    return await this.contentRepository.updateReelStatus(
      reelId,
      status,
      transcript,
      embedding,
    );
  }
}
