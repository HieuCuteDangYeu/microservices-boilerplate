import type { ReelVisibility } from '@common/content/schemas/reel-visibility.schema';
import type {
  IContentRepository,
  ReelProfileContextResult,
} from '@content/domain/interfaces/content.repository.interface';
import type { IFriendContentAccessService } from '@content/domain/interfaces/friend-content-access.service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetProfileReelContextUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,

    @Inject('IFriendContentAccessService')
    private readonly friendContentAccessService: IFriendContentAccessService,
  ) {}

  async execute(
    reelId: string,
    viewerId: string,
    before: number,
    after: number,
  ): Promise<
    | (ReelProfileContextResult & {
        anchorUserId: string;
        anchorVisibility: ReelVisibility;
        selectedId: string;
      })
    | null
  > {
    const anchor = await this.repository.findById(reelId);

    if (!anchor) {
      return null;
    }

    // Do not expose unfinished reels to users other than the owner.
    if (anchor.userId !== viewerId && anchor.status !== 'COMPLETED') {
      return null;
    }

    const allowed = await this.friendContentAccessService.canView({
      viewerId,
      ownerId: anchor.userId,
      visibility: anchor.visibility,
    });

    if (!allowed) {
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
