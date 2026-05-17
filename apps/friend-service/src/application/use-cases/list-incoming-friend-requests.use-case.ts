import { FriendRequestSummary } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { buildProfileMap, getPublicProfile } from './friend-profile.utils';

@Injectable()
export class ListIncomingFriendRequestsUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(userId: string): Promise<FriendRequestSummary[]> {
    const friendRequests =
      await this.friendRepository.listIncomingPending(userId);
    const requesterIds = friendRequests.map(
      (friendRequest) => friendRequest.requesterId,
    );
    const publicProfiles =
      await this.userService.findPublicUsersByIds(requesterIds);
    const profilesById = buildProfileMap(publicProfiles);

    return friendRequests.map((friendRequest) => ({
      id: friendRequest.id!,
      status: 'request_received',
      requestedAt: friendRequest.createdAt!,
      user: getPublicProfile(profilesById, friendRequest.requesterId),
    }));
  }
}
