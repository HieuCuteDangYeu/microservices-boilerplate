import { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import { CannotFriendSelfError } from '@friend/domain/errors/cannot-friend-self.error';
import { FriendshipNotFoundError } from '@friend/domain/errors/friendship-not-found.error';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';

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

    const friendship = await this.friendRepository.findByUsers(
      userId,
      otherUserId,
    );

    if (!friendship || friendship.status !== 'ACCEPTED') {
      throw new FriendshipNotFoundError(otherUserId);
    }

    await this.friendRepository.delete(friendship.id!);

    return {
      message: 'Friend removed successfully',
      status: 'none',
    };
  }
}
