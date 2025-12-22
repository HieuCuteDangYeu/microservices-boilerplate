import { CreateUserDto } from '@common/dtos/create-user.dto';
import type { DeleteUserPayload } from '@common/index';
import type { FindAllUsersPayload } from '@common/interfaces/find-all-users.types';
import type { UpdateUserPayload } from '@common/interfaces/update-user.types';
import { DeleteUserUseCase } from '@identity/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@identity/application/use-cases/find-all-users.use-case';
import { UpdateUserUseCase } from '@identity/application/use-cases/update-user.use-case';
import { UserAlreadyExistsError } from '@identity/domain/errors/user-already-exists.error';
import { UserNotFoundError } from '@identity/domain/errors/user-not-found.error';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';

@Controller()
export class IdentityController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly findAllUsersUseCase: FindAllUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
  ) {}

  @MessagePattern('create_user')
  async handleCreateUser(@Payload() data: CreateUserDto) {
    try {
      return await this.createUserUseCase.execute(data);
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        throw new RpcException({
          status: 409,
          message: error.message,
        });
      }
      throw error;
    }
  }

  @MessagePattern('find_all_users')
  async handleFindAllUsers(@Payload() data: FindAllUsersPayload) {
    return this.findAllUsersUseCase.execute(data);
  }

  @MessagePattern('update_user')
  async handleUpdateUser(@Payload() payload: UpdateUserPayload) {
    try {
      return await this.updateUserUseCase.execute(payload);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new RpcException({
          status: 404,
          message: error.message,
        });
      }
      throw error;
    }
  }

  @MessagePattern('delete_user')
  async handleDeleteUser(@Payload() payload: DeleteUserPayload) {
    try {
      return await this.deleteUserUseCase.execute(payload);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new RpcException({
          statusCode: 404,
          message: error.message,
        });
      }
      throw error;
    }
  }
}
