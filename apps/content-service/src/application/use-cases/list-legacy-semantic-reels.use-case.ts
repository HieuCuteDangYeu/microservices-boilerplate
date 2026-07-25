import type { LegacySemanticBackfillPage } from '@common/processing/interfaces/legacy-semantic-backfill.interface';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListLegacySemanticReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(input: {
    cursor?: string;
    limit?: number;
  }): Promise<LegacySemanticBackfillPage> {
    return await this.contentRepository.listLegacySemanticReels({
      cursor: input.cursor?.trim() || undefined,
      limit: Math.min(Math.max(input.limit ?? 25, 1), 100),
    });
  }
}
