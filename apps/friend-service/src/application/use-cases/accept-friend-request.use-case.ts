import { SagaCompensationError } from '@common/domain/errors/saga.error';
import { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendRequestNotFoundError } from '@friend/domain/errors/friend-request-not-found.error';
import type { Friendship } from '@friend/domain/entities/friendship.entity';
import type { IConversationService } from '@friend/domain/interfaces/conversation-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';

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
    const friendship = await this.friendRepository.findById(requestId);

    if (!friendship || friendship.status !== 'PENDING') {
      throw new FriendRequestNotFoundError(requestId);
    }

    if (friendship.recipientId !== userId) {
      throw new FriendActionForbiddenError(
        'Only the request recipient can accept this friend request',
      );
    }

    let updatedFriendship: Friendship | null = null;

    try {
      updatedFriendship = await this.friendRepository.updateStatus(
        requestId,
        'ACCEPTED',
        new Date(),
      );

      const conversationId =
        await this.conversationService.createDirectConversation(
          userId,
          friendship.getOtherUserId(userId),
        );

      return {
        message: 'Friend request accepted',
        status: 'friends',
        id: updatedFriendship.id!,
        conversationId,
      };
    } catch (error) {
      if (updatedFriendship) {
        try {
          await this.friendRepository.updateStatus(
            updatedFriendship.id!,
            'PENDING',
            null,
          );
        } catch (compensationError) {
          console.error(
            `Failed to rollback accepted friendship ${updatedFriendship.id}`,
            compensationError,
          );
        }
      }

      throw new SagaCompensationError(
        error instanceof Error
          ? error.message
          : 'Failed to accept friend request',
      );
    }
  }
}
