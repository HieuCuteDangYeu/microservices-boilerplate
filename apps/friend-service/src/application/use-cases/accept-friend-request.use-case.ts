import type { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import type { IConversationService } from '@friend/domain/interfaces/conversation-service.interface';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AcceptFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,

    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,

    @Inject('IConversationService')
    private readonly conversationService: IConversationService,
  ) {}

  async execute(
    userId: string,
    requestId: string,
  ): Promise<FriendshipActionResponse> {
    const existingRequest = await this.friendRepository.findById(requestId);

    if (!existingRequest) {
      throw new FriendRequestNotFoundError(requestId);
    }

    if (existingRequest.recipientId !== userId) {
      throw new FriendActionForbiddenError(
        'Only the request recipient can accept this friend request',
      );
    }

    const otherUserId = existingRequest.getOtherUserId(userId);

    const blocked = await this.userBlockRepository.isBlockedBetween(
      userId,
      otherUserId,
    );

    if (blocked) {
      throw new FriendActionForbiddenError(
        'A friend request cannot be accepted between blocked users',
      );
    }

    const result = await this.friendRepository.acceptPendingRequest(
      requestId,
      userId,
      new Date(),
    );

    switch (result.outcome) {
      case 'not_found':
      case 'not_pending':
        throw new FriendRequestNotFoundError(requestId);

      case 'forbidden':
        throw new FriendActionForbiddenError(
          'Only the request recipient can accept this friend request',
        );

      case 'accepted':
      case 'already_accepted': {
        const acceptedOtherUserId = result.friendship.getOtherUserId(userId);

        const conversationId =
          await this.conversationService.createDirectConversation(
            userId,
            acceptedOtherUserId,
          );

        return {
          message:
            result.outcome === 'accepted'
              ? 'Friend request accepted'
              : 'Friend request was already accepted',
          status: 'friends',
          id: result.friendship.id!,
          ...(conversationId ? { conversationId } : {}),
        };
      }
    }
  }
}
