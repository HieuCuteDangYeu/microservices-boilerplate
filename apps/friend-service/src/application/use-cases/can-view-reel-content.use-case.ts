import type {
  CanViewReelContentRequest,
  CanViewReelContentResponse,
} from '@common/friend/interfaces/friend-content-access.interface';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CanViewReelContentUseCase {
  constructor(
    @Inject('IFriendRepository')
    private readonly friendRepository: IFriendRepository,
    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,
  ) {}

  async execute(
    input: CanViewReelContentRequest,
  ): Promise<CanViewReelContentResponse> {
    if (input.viewerId === input.ownerId) {
      return {
        allowed: true,
      };
    }

    const blocked = await this.userBlockRepository.isBlockedBetween(
      input.viewerId,
      input.ownerId,
    );

    if (blocked) {
      return {
        allowed: false,
      };
    }

    if (input.visibility === 'public') {
      return {
        allowed: true,
      };
    }

    if (input.visibility === 'private') {
      return {
        allowed: false,
      };
    }

    const friendship = await this.friendRepository.findByUsers(
      input.viewerId,
      input.ownerId,
    );

    return {
      allowed: friendship?.status === 'ACCEPTED',
    };
  }
}
