import { AuthController } from '@gateway/auth/auth.controller';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { GoogleStrategy } from '@gateway/auth/strategies/google.strategy';
import { MediaController } from '@gateway/media/media.controller';
import { PaymentController } from '@gateway/payment/payment.controller';
import { UserController } from '@gateway/users/user.controller';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api-gateway/.env', '.env'],
    }),
    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE',
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('USER_SERVICE_HOST', '0.0.0.0'),
            port: config.get<number>('USER_SERVICE_PORT', 3001),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'AUTH_SERVICE',
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
        name: 'MEDIA_SERVICE',
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('MEDIA_SERVICE_HOST', '0.0.0.0'),
            port: config.get<number>('MEDIA_SERVICE_PORT', 3004),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'PAYMENT_SERVICE',
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('PAYMENT_SERVICE_HOST', '0.0.0.0'),
            port: config.get<number>('PAYMENT_SERVICE_PORT', 3005),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [
    UserController,
    AuthController,
    MediaController,
    PaymentController,
  ],
  providers: [JwtAuthGuard, GoogleStrategy],
})
export class ApiGatewayModule {}
