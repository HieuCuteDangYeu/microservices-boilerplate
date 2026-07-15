import type { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import type { IConversationService } from '@friend/domain/interfaces/conversation-service.interface';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AcceptFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IConversationService')
    private readonly conversationService: IConversationService,
  ) {}

  async execute(
    userId: string,
    requestId: string,
  ): Promise<FriendshipActionResponse> {
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
        const otherUserId = result.friendship.getOtherUserId(userId);

        const conversationId =
          await this.conversationService.createDirectConversation(
            userId,
            otherUserId,
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
