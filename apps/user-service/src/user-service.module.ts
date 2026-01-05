import { ValidateUserUseCase } from '@auth/application/use-cases/validate-user.use-case';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CreateSocialUserUseCase } from '@user/application/use-cases/create-social-user.use-case';
import { DeleteUserUseCase } from '@user/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@user/application/use-cases/find-all-users.use-case';
import { FindUserByEmailUseCase } from '@user/application/use-cases/find-user-by-email.use-case';
import { FindUserByIdUseCase } from '@user/application/use-cases/find-user-by-id.use-case';
import { UpdateUserAvatarUseCase } from '@user/application/use-cases/update-user-avatar.use-case';
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
      envFilePath: ['apps/user-service/.env', '.env'],
    }),
    ClientsModule.registerAsync([
      {
        name: 'AUTH_SERVICE_TCP',
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTH_SERVICE_HOST', '0.0.0.0'),
            port: config.get<number>('AUTH_SERVICE_PORT', 3002),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'AUTH_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'auth_queue',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
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
    CreateSocialUserUseCase,
    UpdateUserAvatarUseCase,
    FindUserByIdUseCase,
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
