import { BOT_USER_ID } from '@common/constants/seed.constants';
import { Inject, Injectable } from '@nestjs/common';
import type { IFriendRepository } from '../../domain/interfaces/friend.repository.interface';

@Injectable()
export class CanShareWithUserUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
  ) {}

  async execute(input: {
    requesterId: string;
    targetUserId: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (!input.requesterId || !input.targetUserId) {
      return {
        allowed: false,
        reason: 'Missing requesterId or targetUserId',
      };
    }

    if (input.targetUserId === BOT_USER_ID) {
      return {
        allowed: true,
        reason: 'Bot is allowed as a share target',
      };
    }

    if (input.requesterId === input.targetUserId) {
      return {
        allowed: true,
        reason: 'User can share to self',
      };
    }

    const friendship = await this.friendRepository.findByUsers(
      input.requesterId,
      input.targetUserId,
    );

    if (!friendship || friendship.status !== 'ACCEPTED') {
      return {
        allowed: false,
        reason: 'Users are not friends',
      };
    }

    return {
      allowed: true,
    };
  }
}
