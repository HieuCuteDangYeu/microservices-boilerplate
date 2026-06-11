import type {
  CanShareWithUserResult,
  IFriendSharePolicyService,
} from '@content/domain/interfaces/friend-share-policy.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FriendSharePolicyAdapter implements IFriendSharePolicyService {
  private readonly logger = new Logger(FriendSharePolicyAdapter.name);

  constructor(
    @Inject('FRIEND_SERVICE_RMQ')
    private readonly friendClient: ClientProxy,
  ) {}

  async canShareWithUser(input: {
    requesterId: string;
    targetUserId: string;
  }): Promise<CanShareWithUserResult> {
    try {
      const result = await firstValueFrom(
        this.friendClient.send<CanShareWithUserResult>(
          'friend.can_share_with_user',
          input,
        ),
      );

      return result?.allowed
        ? { allowed: true, reason: result.reason }
        : { allowed: false, reason: result?.reason ?? 'Sharing not allowed' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Friend share policy failed: ${message}`);

      return {
        allowed: false,
        reason: 'Unable to verify friend relationship',
      };
    }
  }
}
