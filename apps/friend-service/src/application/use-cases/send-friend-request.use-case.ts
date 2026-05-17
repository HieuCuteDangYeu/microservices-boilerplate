import { FriendshipActionResponse } from '@common/friend/interfaces/friend.types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CannotFriendSelfError } from '@friend/domain/errors/cannot-friend-self.error';
import { FriendRequestAlreadyExistsError } from '@friend/domain/errors/friend-request-already-exists.error';
import { FriendRequestAlreadyReceivedError } from '@friend/domain/errors/friend-request-already-received.error';
import { FriendUserNotFoundError } from '@friend/domain/errors/friend-user-not-found.error';
import { FriendshipAlreadyExistsError } from '@friend/domain/errors/friendship-already-exists.error';
import { Friendship } from '../../domain/entities/friendship.entity';
import type { IFriendRepository } from '../../domain/interfaces/friend.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class SendFriendRequestUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserService') private readonly userService: IUserService,
  ) {}

  async execute(
    userId: string,
    recipientId: string,
  ): Promise<FriendshipActionResponse> {
    if (userId === recipientId) {
      throw new CannotFriendSelfError();
    }

    await this.ensureRecipientExists(recipientId);

    const existing = await this.friendRepository.findByUsers(
      userId,
      recipientId,
    );

    if (existing) {
      this.throwForExistingRelationship(existing, userId);
    }

    const { userOneId, userTwoId } = Friendship.createPair(userId, recipientId);

    try {
      const friendship = await this.friendRepository.create(
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

      return {
        message: 'Friend request sent',
        status: 'request_sent',
        id: friendship.id!,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const conflict = await this.friendRepository.findByUsers(
          userId,
          recipientId,
        );

        if (conflict) {
          this.throwForExistingRelationship(conflict, userId);
        }
      }

      throw error;
    }
  }

  private async ensureRecipientExists(recipientId: string): Promise<void> {
    const recipients = await this.userService.findPublicUsersByIds([
      recipientId,
    ]);

    if (recipients.length === 0) {
      throw new FriendUserNotFoundError(recipientId);
    }
  }

  private throwForExistingRelationship(
    friendship: Friendship,
    userId: string,
  ): never {
    if (friendship.status === 'ACCEPTED') {
      throw new FriendshipAlreadyExistsError();
    }

    if (friendship.requesterId === userId) {
      throw new FriendRequestAlreadyExistsError();
    }

    throw new FriendRequestAlreadyReceivedError();
  }
}
