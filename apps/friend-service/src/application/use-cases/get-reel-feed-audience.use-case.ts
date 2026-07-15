import type { FriendFeedAudienceResponse } from '@common/friend/interfaces/friend-content-access.interface';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetReelFeedAudienceUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,
  ) {}

  async execute(userId: string): Promise<FriendFeedAudienceResponse> {
    const [acceptedFriendIds, excludedUserIds] = await Promise.all([
      this.friendRepository.listAcceptedUserIds(userId),
      this.userBlockRepository.listExcludedUserIds(userId),
    ]);

    const excludedSet = new Set(excludedUserIds);

    return {
      friendUserIds: acceptedFriendIds.filter(
        (friendUserId) => !excludedSet.has(friendUserId),
      ),
      excludedUserIds,
    };
  }
}
