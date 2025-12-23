import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { UserServiceAdapter } from './infrastructure/adapters/user-service.adapter';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { AuthRepository } from './infrastructure/repositories/auth.repository';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'USER_SERVICE_CLIENT',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3001 },
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
    {
      provide: 'IAuthRepository',
      useClass: AuthRepository,
    },
    {
      provide: 'IUserService',
      useClass: UserServiceAdapter,
    },
  ],
})
export class AuthServiceModule {}
