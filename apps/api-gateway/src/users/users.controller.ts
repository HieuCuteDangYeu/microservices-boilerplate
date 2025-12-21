import { CreateUserDto } from '@common/dtos/create-user.dto';
import { CreateUserResponse } from '@common/interfaces/create-user-response.types';
import { RpcError } from '@common/interfaces/rpc-error.types';
import { Body, Controller, HttpException, Inject, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom } from 'rxjs';

@ApiTags('Identity')
@Controller('users')
export class UsersController {
  constructor(
    @Inject('IDENTITY_SERVICE') private readonly identityClient: ClientProxy,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async register(@Body() dto: CreateUserDto): Promise<CreateUserResponse> {
    const pattern = 'create_user';

    return await lastValueFrom(
      this.identityClient.send<CreateUserResponse>(pattern, dto).pipe(
        catchError((error: RpcError) => {
          throw new HttpException(
            error.message || 'Internal Server Error',
            error.status || 500,
          );
        }),
      ),
    );
  }
}
