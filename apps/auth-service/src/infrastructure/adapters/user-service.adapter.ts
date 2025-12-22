import { RegisterDto } from '@common/auth/dtos/register.dto';
import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
          let errorMessage = 'User Service Failed';

          if (err instanceof Error) {
            errorMessage = err.message;
          } else if (
            typeof err === 'object' &&
            err !== null &&
            'message' in err
          ) {
            errorMessage = String((err as Record<string, any>).message);
          }

          return throwError(() => new Error(errorMessage));
        }),
      ),
    );
  }
}
