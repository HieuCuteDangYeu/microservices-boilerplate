import { ValidateUserUseCase } from '@auth/application/use-cases/validate-user.use-case';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DeleteUserUseCase } from '@user/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@user/application/use-cases/find-all-users.use-case';
import { FindUserByEmailUseCase } from '@user/application/use-cases/find-user-by-email.use-case';
import { UpdateUserUseCase } from '@user/application/use-cases/update-user.use-case';
import { VerifyUserUseCase } from '@user/application/use-cases/verify-user.use-case';
import { AuthServiceAdapter } from '@user/infrastructure/adapters/auth-service.adapter';
import { UserController } from '@user/infrastructure/controllers/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { UserRepository } from './infrastructure/repositories/user.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/user-service/.env',
    }),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE_CLIENT',
        transport: Transport.TCP,
        options: { host: '0.0.0.0', port: 3002 },
      },
    ]),
  ],
  controllers: [UserController],
  providers: [
    PrismaService,
    CreateUserUseCase,
    FindAllUsersUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
    ValidateUserUseCase,
    VerifyUserUseCase,
    FindUserByEmailUseCase,
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
    {
      provide: 'IAuthService',
      useClass: AuthServiceAdapter,
    },
  ],
})
export class UserServiceModule {}
