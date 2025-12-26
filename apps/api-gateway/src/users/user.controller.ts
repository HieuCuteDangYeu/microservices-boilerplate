import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateUserDto } from '@common/user/dtos/create-user.dto';
import { UpdateUserDto } from '@common/user/dtos/update-user.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import {
  DeleteUserPayload,
  DeleteUserResponse,
} from '@common/user/interfaces/delete-user.types';
import { PaginatedUsersResponse } from '@common/user/interfaces/find-all-users.types';
import {
  UpdateUserPayload,
  UpdateUserResponse,
} from '@common/user/interfaces/update-user.types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom } from 'rxjs';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    @Inject('USER_SERVICE') private readonly userClient: ClientProxy,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async register(@Body() dto: CreateUserDto): Promise<CreateUserResponse> {
    return await lastValueFrom(
      this.userClient.send<CreateUserResponse>('create_user', dto).pipe(
        catchError((error) => {
          this.handleMicroserviceError(error);
        }),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  async findAll(
    @Query() query: PaginationDto,
  ): Promise<PaginatedUsersResponse> {
    return await lastValueFrom(
      this.userClient
        .send<PaginatedUsersResponse>('find_all_users', query)
        .pipe(
          catchError((error) => {
            this.handleMicroserviceError(error);
          }),
        ),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UpdateUserResponse> {
    const payload: UpdateUserPayload = { id, data: dto };

    return await lastValueFrom(
      this.userClient.send<UpdateUserResponse>('update_user', payload).pipe(
        catchError((error) => {
          this.handleMicroserviceError(error);
        }),
      ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  async remove(@Param('id') id: string): Promise<DeleteUserResponse> {
    const payload: DeleteUserPayload = { id };

    return await lastValueFrom(
      this.userClient.send<DeleteUserResponse>('delete_user', payload).pipe(
        catchError((error) => {
          this.handleMicroserviceError(error);
        }),
      ),
    );
  }

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }

    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
