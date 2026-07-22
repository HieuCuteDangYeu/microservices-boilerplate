import type {
  ReelContextAccessRequest,
  ReelContextAccessResult,
} from '@common/content/interfaces/reel-context-search-request.interface';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ResolveReelContextAccessUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    input: ReelContextAccessRequest,
  ): Promise<ReelContextAccessResult> {
    return {
      reelIds: await this.contentRepository.findAccessibleSharedReelIds(input),
    };
  }
}
