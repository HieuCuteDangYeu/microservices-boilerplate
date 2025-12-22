import { RegisterDto } from '@common/auth/dtos/register.dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SagaCompensationError } from '../../domain/errors/saga.error';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject('IAuthRepository')
    private readonly authRepository: IAuthRepository,
    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(dto: RegisterDto) {
    const userId = randomUUID();

    try {
      await this.authRepository.assignRole(userId, 'USER');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown DB Error';
      throw new SagaCompensationError(
        `Failed to assign initial role: ${errorMessage}`,
      );
    }

    try {
      const result = await this.userService.createUser(userId, dto);

      return {
        id: userId,
        email: result.email,
        message: 'User registered successfully',
      };
    } catch (error) {
      console.error(`Saga Failed for User ${userId}. Rolling back roles...`);

      try {
        await this.authRepository.rollbackRoles(userId);
      } catch (rollbackError) {
        console.error('CRITICAL: Saga Compensation Failed', rollbackError);
      }

      throw new SagaCompensationError(
        error instanceof Error ? error.message : 'Registration Failed',
      );
    }
  }
}
