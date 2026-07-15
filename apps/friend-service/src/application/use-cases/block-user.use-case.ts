import type { UserBlockActionResponse } from '@common/friend/interfaces/user-block-action.interface';
import { CannotBlockSelfError } from '@friend/domain/errors/cannot-block-self.error';
import { FriendUserNotFoundError } from '@friend/domain/errors/friend-user-not-found.error';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class BlockUserUseCase {
  constructor(
    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,
    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(
    blockerId: string,
    blockedUserId: string,
  ): Promise<UserBlockActionResponse> {
    if (blockerId === blockedUserId) {
      throw new CannotBlockSelfError();
    }

    const users = await this.userService.findPublicUsersByIds([blockedUserId]);

    if (users.length === 0) {
      throw new FriendUserNotFoundError(blockedUserId);
    }

    await this.userBlockRepository.blockAndRemoveRelationship(
      blockerId,
      blockedUserId,
    );

    return {
      userId: blockedUserId,
      blocked: true,
      message: 'User blocked',
    };
  }
}
