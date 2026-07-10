import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CheckUsernameAvailabilityUseCase } from '@user/application/use-cases/check-username-availability.use-case';
import { CreateSocialUserUseCase } from '@user/application/use-cases/create-social-user.use-case';
import { DeleteUserUseCase } from '@user/application/use-cases/delete-user.use-case';
import { FindAllUsersUseCase } from '@user/application/use-cases/find-all-users.use-case';
import { FindPublicUserByUsernameUseCase } from '@user/application/use-cases/find-public-user-by-username.use-case';
import { FindPublicUsersByIdsUseCase } from '@user/application/use-cases/find-public-users-by-ids.use-case';
import { FindUserByEmailUseCase } from '@user/application/use-cases/find-user-by-email.use-case';
import { FindUserByIdUseCase } from '@user/application/use-cases/find-user-by-id.use-case';
import { FindUsersByIdsUseCase } from '@user/application/use-cases/find-users-by-ids.use-case';
import { GetRecommendedPublicUsersUseCase } from '@user/application/use-cases/get-recommended-public-users.use-case';
import { SearchPublicUsersUseCase } from '@user/application/use-cases/search-public-users.use-case';
import { UpdateUserAvatarUseCase } from '@user/application/use-cases/update-user-avatar.use-case';
import { UpdateUserUseCase } from '@user/application/use-cases/update-user.use-case';
import { ValidateUserUseCase } from '@user/application/use-cases/validate-user.use-case';
import { ValidateUsersListUseCase } from '@user/application/use-cases/validate-users-list.use-case';
import { VerifyUserUseCase } from '@user/application/use-cases/verify-user.use-case';
import { AuthServiceAdapter } from '@user/infrastructure/adapters/auth-service.adapter';
import { UserController } from '@user/infrastructure/controllers/user.controller';
import { R2StorageService } from '@user/infrastructure/services/r2-storage.service';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { UserRepository } from './infrastructure/repositories/user.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
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
    FindPublicUserByUsernameUseCase,
    FindPublicUsersByIdsUseCase,
    FindUsersByIdsUseCase,
    SearchPublicUsersUseCase,
    CheckUsernameAvailabilityUseCase,
    ValidateUsersListUseCase,
    GetRecommendedPublicUsersUseCase,
    {
      provide: 'IUserRepository',
      useClass: UserRepository,
    },
    {
      provide: 'IAuthService',
      useClass: AuthServiceAdapter,
    },
    {
      provide: 'IStorageService',
      useClass: R2StorageService,
    },
  ],
})
export class UserServiceModule {}
