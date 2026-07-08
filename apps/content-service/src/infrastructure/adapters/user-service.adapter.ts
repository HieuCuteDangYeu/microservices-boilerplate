import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom, of, timeout } from 'rxjs';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class UserServiceAdapter implements IUserService {
  private readonly logger = new Logger(UserServiceAdapter.name);

  constructor(
    @Inject('USER_SERVICE_RMQ') private readonly client: ClientProxy,
  ) {}

  async findPublicUsersByIds(ids: string[]): Promise<PublicUserProfile[]> {
    if (ids.length === 0) {
      return [];
    }

    return lastValueFrom(
      this.client
        .send<PublicUserProfile[]>('user.find_public_by_ids', ids)
        .pipe(
          timeout(5000),
          catchError((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(`RPC Error [findPublicUsersByIds]: ${message}`);
            return of([] as PublicUserProfile[]);
          }),
        ),
      { defaultValue: [] },
    );
  }
}
