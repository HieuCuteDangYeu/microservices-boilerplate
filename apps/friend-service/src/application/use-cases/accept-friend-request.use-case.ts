import { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '../../domain/interfaces/friend.repository.interface';

@Injectable()
export class AcceptFriendRequestUseCase {
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
        'Only the request recipient can accept this friend request',
      );
    }

    const updatedFriendship = await this.friendRepository.updateStatus(
      requestId,
      'ACCEPTED',
      new Date(),
    );

    return {
      message: 'Friend request accepted',
      status: 'friends',
      id: updatedFriendship.id!,
    };
  }
}
