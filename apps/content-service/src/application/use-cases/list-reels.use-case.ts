import { Reel } from '@content/domain/entities/reel.entity';
import type {
  IContentRepository,
  ReelListQuery,
} from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    return this.repository.listReels(query);
  }
}
