import type { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { Friendship } from '@friend/domain/entities/friendship.entity';
import { CannotFriendSelfError } from '@friend/domain/errors/cannot-friend-self.error';
import { FriendActionForbiddenError } from '@friend/domain/errors/friend-action-forbidden.error';
import { FriendUserNotFoundError } from '@friend/domain/errors/friend-user-not-found.error';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class SendFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,

    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,

    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(
    userId: string,
    recipientId: string,
  ): Promise<FriendshipActionResponse> {
    if (userId === recipientId) {
      throw new CannotFriendSelfError();
    }

    await this.ensureRecipientExists(recipientId);

    const blocked = await this.userBlockRepository.isBlockedBetween(
      userId,
      recipientId,
    );

    if (blocked) {
      throw new FriendActionForbiddenError(
        'A friend request cannot be sent between blocked users',
      );
    }

    const { userOneId, userTwoId } = Friendship.createPair(userId, recipientId);

    const result = await this.friendRepository.createOrFindPending(
      new Friendship(
        null,
        userId,
        recipientId,
        userOneId,
        userTwoId,
        'PENDING',
        null,
        null,
        null,
      ),
    );

    if (result.created) {
      return {
        message: 'Friend request sent',
        status: 'request_sent',
        id: result.friendship.id!,
      };
    }

    if (result.friendship.status === 'ACCEPTED') {
      return {
        message: 'Users are already friends',
        status: 'friends',
        id: result.friendship.id!,
      };
    }

    if (result.friendship.requesterId === userId) {
      return {
        message: 'Friend request already sent',
        status: 'request_sent',
        id: result.friendship.id!,
      };
    }

    return {
      message: 'You already have an incoming friend request from this user',
      status: 'request_received',
      id: result.friendship.id!,
    };
  }

  private async ensureRecipientExists(recipientId: string): Promise<void> {
    const users = await this.userService.findPublicUsersByIds([recipientId]);

    if (users.length === 0) {
      throw new FriendUserNotFoundError(recipientId);
    }
  }
}
