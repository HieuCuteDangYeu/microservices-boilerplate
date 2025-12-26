import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import { ValidateUserResponse } from '@common/user/interfaces/validate-user-response.types';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { catchError, lastValueFrom, throwError } from 'rxjs';
import { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class UserServiceAdapter implements IUserService {
  constructor(
    @Inject('USER_SERVICE_CLIENT') private readonly client: ClientProxy,
  ) {}

  async createUser(id: string, dto: RegisterDto): Promise<CreateUserResponse> {
    const payload: CreateUserPayloadDto = {
      id,
      email: dto.email,
      password: dto.password,
    };

    return lastValueFrom(
      this.client.send<CreateUserResponse>('create_user', payload).pipe(
        catchError((err) => {
          if (isRpcError(err) && err.statusCode === 409) {
            return throwError(() => new UserAlreadyExistsError(dto.email));
          }

          let errorMessage = 'User Service Failed';

          if (isRpcError(err)) {
            errorMessage = Array.isArray(err.message)
              ? err.message.join(', ')
              : err.message;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }

          return throwError(() => new Error(errorMessage));
        }),
      ),
    );
  }

  async validateUser(dto: LoginDto): Promise<ValidateUserResponse | null> {
    return lastValueFrom(
      this.client
        .send<ValidateUserResponse | null>('validate_user', dto)
        .pipe(
          catchError(() => throwError(() => new Error('Validation failed'))),
        ),
    );
  }

  async verifyUser(id: string): Promise<void> {
    return lastValueFrom(
      this.client.send<void>('verify_user', id).pipe(
        catchError(() => {
          return throwError(() => new Error('Failed to verify user'));
        }),
      ),
      { defaultValue: undefined },
    );
  }
}
