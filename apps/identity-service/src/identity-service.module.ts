import { FindAllUsersUseCase } from '@identity/application/use-cases/find-all-users.use-case';
import { UpdateUserUseCase } from '@identity/application/use-cases/update-user.use-case';
import { Module } from '@nestjs/common';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { IdentityController } from './infrastructure/controllers/identity.controller';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { UserRepository } from './infrastructure/repositories/user.repository';

@Module({
  controllers: [IdentityController],
  providers: [
    PrismaService,
    CreateUserUseCase,
    FindAllUsersUseCase,
    UpdateUserUseCase,
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
  ],
})
export class IdentityServiceModule {}
