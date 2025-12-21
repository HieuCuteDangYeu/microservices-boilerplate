import { CreateUserDto } from '@common/dtos/create-user.dto';
import type { FindAllUsersPayload } from '@common/interfaces/find-all-users.types';
import { FindAllUsersUseCase } from '@identity/application/use-cases/find-all-users.use-case';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';

@Controller()
export class IdentityController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly findAllUsersUseCase: FindAllUsersUseCase,
  ) {}

  @MessagePattern('create_user')
  async handleCreateUser(@Payload() data: CreateUserDto) {
    return this.createUserUseCase.execute(data);
  }

  @MessagePattern('find_all_users')
  async handleFindAllUsers(@Payload() data: FindAllUsersPayload) {
    return this.findAllUsersUseCase.execute(data);
  }
}
