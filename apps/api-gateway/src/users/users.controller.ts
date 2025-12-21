import { CreateUserDto } from '@common/dtos/create-user.dto';
import { CreateUserResponse } from '@common/interfaces/create-user-response.types';
import { PaginatedUsersResponse } from '@common/interfaces/find-all-users.types';
import { RpcError } from '@common/interfaces/rpc-error.types';
import { PaginationDto } from '@gateway/users/dto/pagination.dto';
import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
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

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  async findAll(@Query() query: PaginationDto) {
    const pattern = 'find_all_users';

    return await lastValueFrom(
      this.identityClient.send<PaginatedUsersResponse>(pattern, query).pipe(
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
