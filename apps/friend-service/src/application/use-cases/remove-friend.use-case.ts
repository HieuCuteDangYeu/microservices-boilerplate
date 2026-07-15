import type { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { CannotFriendSelfError } from '@friend/domain/errors/cannot-friend-self.error';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemoveFriendUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
  ) {}

  async execute(
    userId: string,
    otherUserId: string,
  ): Promise<FriendshipActionResponse> {
    if (userId === otherUserId) {
      throw new CannotFriendSelfError();
    }

    const removed = await this.friendRepository.deleteAcceptedByUsers(
      userId,
      otherUserId,
    );

    return {
      message: removed
        ? 'Friend removed successfully'
        : 'Friendship was already removed',
      status: 'none',
    };
  }
}
