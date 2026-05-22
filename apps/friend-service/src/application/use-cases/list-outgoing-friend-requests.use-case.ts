import { FriendRequestSummary } from '@common/friend/interfaces/friend.types';
import type {
  FriendshipPaginationCursor,
  IFriendRepository,
  PaginatedFriendCollection,
} from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { buildProfileMap, getPublicProfile } from './friend-profile.utils';

@Injectable()
export class ListOutgoingFriendRequestsUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(
    userId: string,
    limit: number = 20,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendCollection<FriendRequestSummary>> {
    const friendRequests = await this.friendRepository.listOutgoingPending(
      userId,
      limit,
      cursor,
    );
    const recipientIds = friendRequests.items.map(
      (friendRequest) => friendRequest.recipientId,
    );
    const publicProfiles =
      await this.userService.findPublicUsersByIds(recipientIds);
    const profilesById = buildProfileMap(publicProfiles);

    return {
      items: friendRequests.items.map((friendRequest) => ({
        id: friendRequest.id!,
        status: 'request_sent',
        requestedAt: friendRequest.createdAt!,
        user: getPublicProfile(profilesById, friendRequest.recipientId),
      })),
      nextCursor: friendRequests.nextCursor,
    };
  }
}
