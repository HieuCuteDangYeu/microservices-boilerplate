import { ConfirmAccountUseCase } from '@auth/application/use-cases/confirm-account.use-case';
import { DeleteUserRolesUseCase } from '@auth/application/use-cases/delete-user-roles.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { MailServiceAdapter } from '@auth/infrastructure/adapters/mail-service.adapter';
import { RedisVerificationCodeRepository } from '@auth/infrastructure/repositories/redis-verification-code.repository';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import Redis from 'ioredis';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { UserServiceAdapter } from './infrastructure/adapters/user-service.adapter';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { AuthRepository } from './infrastructure/repositories/auth.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/auth-service/.env',
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE_CLIENT',
        transport: Transport.TCP,
        options: { host: '0.0.0.0', port: 3001 },
      },
      {
        name: 'MAIL_SERVICE_CLIENT',
        transport: Transport.TCP,
        options: { host: '0.0.0.0', port: 3003 },
      },
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'super_secret_key',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaService,
    RegisterUseCase,
    LoginUseCase,
    DeleteUserRolesUseCase,
    ConfirmAccountUseCase,
    {
      provide: 'IAuthRepository',
      useClass: AuthRepository,
    },
    {
      provide: 'IUserService',
      useClass: UserServiceAdapter,
    },
    {
      provide: 'IMailService',
      useClass: MailServiceAdapter,
    },
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD'),
          tls: (config.get<string>('REDIS_HOST') ?? '').includes('upstash')
            ? { servername: config.get('REDIS_HOST') }
            : undefined,
        });
      },
    },
    {
      provide: 'IVerificationCodeRepository',
      useClass: RedisVerificationCodeRepository,
    },
  ],
})
export class AuthServiceModule {}
