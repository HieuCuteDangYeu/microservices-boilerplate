import { AuthController } from '@gateway/auth/auth.controller';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { GoogleStrategy } from '@gateway/auth/strategies/google.strategy';
import { MediaController } from '@gateway/media/media.controller';
import { PaymentController } from '@gateway/payment/payment.controller';
import { UserController } from '@gateway/users/user.controller';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/api-gateway/.env',
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.TCP,
        options: {
          host: '0.0.0.0',
          port: 3001,
        },
      },
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: '0.0.0.0',
          port: 3002,
        },
      },
      {
        name: 'MEDIA_SERVICE',
        transport: Transport.TCP,
        options: {
          host: '0.0.0.0',
          port: 3004,
        },
      },
      {
        name: 'PAYMENT_SERVICE',
        transport: Transport.TCP,
        options: {
          host: '0.0.0.0',
          port: 3005,
        },
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
