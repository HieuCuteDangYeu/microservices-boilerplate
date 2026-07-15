import type { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CancelFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
  ) {}

  async execute(
    userId: string,
    requestId: string,
  ): Promise<FriendshipActionResponse> {
    const result = await this.friendRepository.deletePendingOutgoingRequest(
      requestId,
      userId,
    );

    if (result.outcome === 'deleted' || result.outcome === 'not_found') {
      return {
        message:
          result.outcome === 'deleted'
            ? 'Friend request cancelled'
            : 'Friend request was already removed',
        status: 'none',
      };
    }

    if (result.outcome === 'forbidden') {
      throw new FriendActionForbiddenError(
        'Only the request sender can cancel this friend request',
      );
    }

    throw new FriendRequestNotFoundError(requestId);
  }
}
