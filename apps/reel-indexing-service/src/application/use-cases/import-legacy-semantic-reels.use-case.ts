import type { LegacySemanticReel } from '@common/processing/interfaces/legacy-semantic-backfill.interface';
import type { ISemanticIndexRepository } from '@indexing/domain/interfaces/semantic-index.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ImportLegacySemanticReelsUseCase {
  constructor(
    @Inject('ISemanticIndexRepository')
    private readonly semanticIndex: ISemanticIndexRepository,
  ) {}

  async execute(input: { items?: LegacySemanticReel[] }) {
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length > 100) {
      throw new Error(
        'Legacy semantic import page must contain at most 100 Reels',
      );
    }
    return await this.semanticIndex.importLegacySemanticReels(items);
  }
}
