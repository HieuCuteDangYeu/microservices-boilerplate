import { Module } from '@nestjs/common';
import { DeleteUserUseCase } from '@user/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@user/application/use-cases/find-all-users.use-case';
import { UpdateUserUseCase } from '@user/application/use-cases/update-user.use-case';
import { UserController } from '@user/infrastructure/controllers/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { UserRepository } from './infrastructure/repositories/user.repository';

@Module({
  controllers: [UserController],
  providers: [
    PrismaService,
    CreateUserUseCase,
    FindAllUsersUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
  ],
})
export class UserServiceModule {}
