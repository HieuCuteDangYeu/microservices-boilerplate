import { FriendSummary } from '@common/friend/interfaces/friend.types';
import { FriendUserNotFoundError } from '@friend/domain/errors/friend-user-not-found.error';
import type {
  FriendshipPaginationCursor,
  IFriendRepository,
  PaginatedFriendCollection,
} from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { buildProfileMap, getPublicProfile } from './friend-profile.utils';

@Injectable()
export class ListFriendsUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(
    userId: string,
    limit: number = 20,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendCollection<FriendSummary>> {
    const [targetUser] = await this.userService.findPublicUsersByIds([userId]);

    if (!targetUser) {
      throw new FriendUserNotFoundError(userId);
    }

    const friendships = await this.friendRepository.listAccepted(
      userId,
      limit,
      cursor,
    );
    const otherUserIds = Array.from(
      new Set(
        friendships.items.map((friendship) =>
          friendship.getOtherUserId(userId),
        ),
      ),
    );
    const publicProfiles =
      await this.userService.findPublicUsersByIds(otherUserIds);
    const profilesById = buildProfileMap(publicProfiles);

    return {
      items: friendships.items.map((friendship) => {
        const otherUserId = friendship.getOtherUserId(userId);

        return {
          id: friendship.id!,
          status: 'friends',
          friendsSince:
            friendship.respondedAt ??
            friendship.updatedAt ??
            friendship.createdAt!,
          user: getPublicProfile(profilesById, otherUserId),
        };
      }),
      nextCursor: friendships.nextCursor,
    };
  }
}
