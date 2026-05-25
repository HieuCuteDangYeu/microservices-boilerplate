import type {
  IContentRepository,
  ReelProfileContextResult,
} from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetProfileReelContextUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
    before: number,
    after: number,
  ): Promise<
    | (ReelProfileContextResult & {
        anchorUserId: string;
        anchorVisibility: 'public' | 'private';
        selectedId: string;
      })
    | null
  > {
    const anchor = await this.repository.findById(reelId);

    if (!anchor) {
      return null;
    }

    const result = await this.repository.getProfileReelContext({
      anchor,
      before,
      after,
    });

    return {
      ...result,
      anchorUserId: anchor.userId,
      anchorVisibility: anchor.visibility,
      selectedId: anchor.id,
    };
  }
}
