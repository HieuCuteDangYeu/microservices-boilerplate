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
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
  ],
})
export class IdentityServiceModule {}
