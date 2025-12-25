import { DeleteUserRolesUseCase } from '@auth/application/use-cases/delete-user-roles.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { Controller } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { SagaCompensationError } from '../../domain/errors/saga.error';

@Controller()
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly jwtService: JwtService,
    private readonly deleteUserRolesUseCase: DeleteUserRolesUseCase,
  ) {}

  @MessagePattern('auth.register')
  async register(@Payload() dto: RegisterDto) {
    try {
      return await this.registerUseCase.execute(dto);
    } catch (error) {
      if (error instanceof SagaCompensationError) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }
      throw new RpcException({
        statusCode: 500,
        message: 'Internal Server Error',
      });
    }
  }

  @MessagePattern('auth.login')
  async login(@Payload() dto: LoginDto) {
    try {
      return await this.loginUseCase.execute(dto);
    } catch (error) {
      throw new RpcException({
        statusCode: 401,
        message: error instanceof Error ? error.message : 'Login failed',
      });
    }
  }

  @MessagePattern('auth.verify_token')
  async verifyToken(@Payload() data: { token: string }) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(data.token);

      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid Token',
      });
    }
  }

  @EventPattern('auth.delete_user_roles')
  async handleDeleteUserRoles(@Payload() data: { userId: string }) {
    await this.deleteUserRolesUseCase.execute(data.userId);
  }
}
