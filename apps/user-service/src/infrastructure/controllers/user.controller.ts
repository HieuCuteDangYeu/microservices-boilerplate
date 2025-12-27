import { ValidateUserUseCase } from '@auth/application/use-cases/validate-user.use-case';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { CreateSocialUserDto } from '@common/user/dtos/create-social-user.dto';
import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import type { DeleteUserPayload } from '@common/user/interfaces/delete-user.types';
import type { FindAllUsersPayload } from '@common/user/interfaces/find-all-users.types';
import type { UpdateUserPayload } from '@common/user/interfaces/update-user.types';
import { Controller } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { CreateSocialUserUseCase } from '@user/application/use-cases/create-social-user.use-case';
import { DeleteUserUseCase } from '@user/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@user/application/use-cases/find-all-users.use-case';
import { FindUserByEmailUseCase } from '@user/application/use-cases/find-user-by-email.use-case';
import { UpdateUserUseCase } from '@user/application/use-cases/update-user.use-case';
import { VerifyUserUseCase } from '@user/application/use-cases/verify-user.use-case';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { UserNotFoundError } from '@user/domain/errors/user-not-found.error';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';

@Controller()
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly findAllUsersUseCase: FindAllUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly validateUserUseCase: ValidateUserUseCase,
    private readonly verifyUserUseCase: VerifyUserUseCase,
    private readonly findUserByEmailUseCase: FindUserByEmailUseCase,
    private readonly createSocialUserUseCase: CreateSocialUserUseCase,
  ) {}

  @MessagePattern('create_user')
  async handleCreateUser(@Payload() data: CreateUserPayloadDto) {
    try {
      return await this.createUserUseCase.execute(data);
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        throw new RpcException({
          statusCode: 409,
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
          statusCode: 404,
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

  @MessagePattern('validate_user')
  async validateUser(@Payload() dto: LoginDto) {
    return await this.validateUserUseCase.execute(dto);
  }

  @MessagePattern('verify_user')
  async handleVerifyUser(@Payload() id: string) {
    return await this.verifyUserUseCase.execute(id);
  }

  @MessagePattern('user.find_by_email')
  async findByEmail(@Payload() data: { email: string }) {
    return await this.findUserByEmailUseCase.execute(data.email);
  }

  @MessagePattern('user.create_social')
  async createSocialUser(@Payload() dto: CreateSocialUserDto) {
    return await this.createSocialUserUseCase.execute(dto);
  }

  @EventPattern('user.rollback')
  async rollback(@Payload() data: DeleteUserPayload) {
    await this.deleteUserUseCase.execute(data);
  }
}
