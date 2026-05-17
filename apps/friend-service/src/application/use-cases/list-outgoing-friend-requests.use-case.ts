import { FriendRequestSummary } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { buildProfileMap, getPublicProfile } from './friend-profile.utils';

@Injectable()
export class ListOutgoingFriendRequestsUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(userId: string): Promise<FriendRequestSummary[]> {
    const friendRequests =
      await this.friendRepository.listOutgoingPending(userId);
    const recipientIds = friendRequests.map(
      (friendRequest) => friendRequest.recipientId,
    );
    const publicProfiles =
      await this.userService.findPublicUsersByIds(recipientIds);
    const profilesById = buildProfileMap(publicProfiles);

    return friendRequests.map((friendRequest) => ({
      id: friendRequest.id!,
      status: 'request_sent',
      requestedAt: friendRequest.createdAt!,
      user: getPublicProfile(profilesById, friendRequest.recipientId),
    }));
  }
}
