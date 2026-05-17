import { FriendshipStatusResponse } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';

@Injectable()
export class GetFriendshipStatusUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
  ) {}

  async execute(
    userId: string,
    otherUserId: string,
  ): Promise<FriendshipStatusResponse> {
    if (userId === otherUserId) {
      return { status: 'none' };
    }

    const friendship = await this.friendRepository.findByUsers(
      userId,
      otherUserId,
    );

    if (!friendship) {
      return { status: 'none' };
    }

    if (friendship.status === 'ACCEPTED') {
      return {
        status: 'friends',
        id: friendship.id!,
      };
    }

    return {
      status:
        friendship.requesterId === userId ? 'request_sent' : 'request_received',
      id: friendship.id!,
    };
  }
}
