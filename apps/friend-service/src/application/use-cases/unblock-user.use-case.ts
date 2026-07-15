import type { UserBlockActionResponse } from '@common/friend/interfaces/user-block-action.interface';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UnblockUserUseCase {
  constructor(
    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,
  ) {}

  async execute(
    blockerId: string,
    blockedUserId: string,
  ): Promise<UserBlockActionResponse> {
    const removed = await this.userBlockRepository.unblock(
      blockerId,
      blockedUserId,
    );

    return {
      userId: blockedUserId,
      blocked: false,
      message: removed ? 'User unblocked' : 'User was already unblocked',
    };
  }
}
