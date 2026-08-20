import { ValidateUserResponse } from '@common/user/interfaces/validate-user-response.types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom, of, timeout } from 'rxjs';
import { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class UserServiceAdapter implements IUserService {
  private readonly logger = new Logger(UserServiceAdapter.name);

  constructor(
    @Inject('USER_SERVICE_RMQ') private readonly client: ClientProxy,
  ) {}

  async validateUsers(ids: string[]): Promise<boolean> {
    return lastValueFrom(
      this.client
        .send<boolean>('user.validate_list', { ids })
        .pipe(
          timeout(5000),
          catchError((err: unknown) => {
            const error = err as Error;
            this.logger.error(`RPC Error [validateUsers]: ${error.message}`);
            return of(false);
          }),
        ),
      { defaultValue: false },
    );
  }

  async findUsersByIds(ids: string[]): Promise<ValidateUserResponse[]> {
    return lastValueFrom(
      this.client
        .send<ValidateUserResponse[]>('user.find_by_ids', ids)
        .pipe(
          timeout(5000),
          catchError((err: unknown) => {
            const error = err as Error;
            this.logger.error(`RPC Error [findUsersByIds]: ${error.message}`);
            return of([] as ValidateUserResponse[]);
          }),
        ),
      { defaultValue: [] },
    );
  }
}
