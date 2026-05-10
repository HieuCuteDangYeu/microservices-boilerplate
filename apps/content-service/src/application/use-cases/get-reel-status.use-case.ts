import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class GetReelStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
  ): Promise<{ status: string; mediaKey?: string }> {
    const reel = await this.contentRepository.findById(reelId);

    if (!reel) {
      return { status: 'NOT_FOUND' };
    }

    return {
      status: reel.status,
      mediaKey: reel.mediaKey,
    };
  }
}
