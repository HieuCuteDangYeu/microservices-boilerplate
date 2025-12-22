import { RegisterDto } from '@common/auth/dtos/register.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { SagaCompensationError } from '../../domain/errors/saga.error';

@Controller()
export class AuthController {
  constructor(private readonly registerUseCase: RegisterUseCase) {}

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
}
