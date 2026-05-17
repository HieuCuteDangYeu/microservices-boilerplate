import { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import type { IFriendRepository } from '../../domain/interfaces/friend.repository.interface';

@Injectable()
export class RejectFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
  ) {}

  async execute(
    userId: string,
    requestId: string,
  ): Promise<FriendshipActionResponse> {
    const friendship = await this.friendRepository.findById(requestId);

    if (!friendship || friendship.status !== 'PENDING') {
      throw new FriendRequestNotFoundError(requestId);
    }

    if (friendship.recipientId !== userId) {
      throw new FriendActionForbiddenError(
        'Only the request recipient can reject this friend request',
      );
    }

    await this.friendRepository.delete(requestId);

    return {
      message: 'Friend request rejected',
      status: 'none',
    };
  }
}
