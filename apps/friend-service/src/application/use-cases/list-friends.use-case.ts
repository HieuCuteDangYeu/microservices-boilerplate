import { FriendSummary } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { buildProfileMap, getPublicProfile } from './friend-profile.utils';

@Injectable()
export class ListFriendsUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(userId: string): Promise<FriendSummary[]> {
    const friendships = await this.friendRepository.listAccepted(userId);
    const otherUserIds = Array.from(
      new Set(
        friendships.map((friendship) => friendship.getOtherUserId(userId)),
      ),
    );
    const publicProfiles =
      await this.userService.findPublicUsersByIds(otherUserIds);
    const profilesById = buildProfileMap(publicProfiles);

    return friendships.map((friendship) => {
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
    });
  }
}
