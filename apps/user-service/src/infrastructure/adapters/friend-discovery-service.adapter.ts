import type { FriendFeedAudienceResponse } from '@common/friend/interfaces/friend-content-access.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { IFriendDiscoveryService } from '@user/domain/interfaces/friend-discovery.service.interface';
import { catchError, lastValueFrom, throwError, timeout } from 'rxjs';

@Injectable()
export class FriendDiscoveryServiceAdapter implements IFriendDiscoveryService {
  private readonly logger = new Logger(FriendDiscoveryServiceAdapter.name);

  constructor(
    @Inject('FRIEND_SERVICE_RMQ')
    private readonly friendClient: ClientProxy,
  ) {}

  async getAudience(userId: string): Promise<FriendFeedAudienceResponse> {
    return await lastValueFrom(
      this.friendClient
        .send<FriendFeedAudienceResponse>('friend.get_reel_feed_audience', {
          userId,
        })
        .pipe(
          timeout(5000),
          catchError((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);

            this.logger.error(`RPC Error [getAudience]: ${message}`);

            // Fail closed. Search and recommendation endpoints must not
            // return users when block/friend exclusions cannot be loaded.
            return throwError(
              () => new Error('Failed to load friend discovery exclusions'),
            );
          }),
        ),
    );
  }
}
