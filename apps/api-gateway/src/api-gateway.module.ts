import { AuthController } from '@gateway/auth/auth.controller';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { UserController } from '@gateway/users/user.controller';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [UserController, AuthController],
  providers: [JwtAuthGuard],
})
export class ApiGatewayModule {}
