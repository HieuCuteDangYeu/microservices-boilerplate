import { Reel } from '@content/domain/entities/reel.entity';
import type {
  IContentRepository,
  ReelCursor,
} from '@content/domain/interfaces/content.repository.interface';
import type { IFriendContentAccessService } from '@content/domain/interfaces/friend-content-access.service.interface';
import { Inject, Injectable } from '@nestjs/common';

export interface GetFriendsReelsInput {
  viewerId: string;
  limit?: number;
  cursor?: ReelCursor;
}

export interface GetFriendsReelsResult {
  items: Reel[];
  nextCursor: ReelCursor | null;
}

@Injectable()
export class GetFriendsReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('IFriendContentAccessService')
    private readonly friendContentAccessService: IFriendContentAccessService,
  ) {}

  async execute(input: GetFriendsReelsInput): Promise<GetFriendsReelsResult> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    const audience = await this.friendContentAccessService.getFeedAudience(
      input.viewerId,
    );

    if (audience.friendUserIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    return await this.contentRepository.listFriendsReels({
      friendUserIds: audience.friendUserIds,
      excludedUserIds: audience.excludedUserIds,
      limit,
      cursor: input.cursor,
    });
  }
}
