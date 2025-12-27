import { RegisterDto } from '@common/auth/dtos/register.dto';
import { SagaCompensationError } from '@common/domain/errors/saga.error';
import { Inject, Injectable } from '@nestjs/common';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { randomBytes, randomUUID } from 'crypto';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IMailService } from '../../domain/interfaces/mail-service.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import type { IVerificationCodeRepository } from '../../domain/interfaces/verification-code.repository.interface';

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IMailService') private readonly mailService: IMailService,
    @Inject('IVerificationCodeRepository')
    private readonly verificationRepo: IVerificationCodeRepository,
  ) {}

  async execute(dto: RegisterDto) {
    const userId = randomUUID();

    try {
      const result = await this.userService.createUser(userId, dto);

      await this.authRepository.assignRole(userId, 'USER');

      const token = randomBytes(32).toString('hex');
      await this.verificationRepo.save(token, userId, 86400);

      this.mailService.sendConfirmationEmail(result.email, token);

      return {
        id: userId,
        email: result.email,
        message: 'User registered successfully',
      };
    } catch (error) {
      console.error(`Saga Failed for User ${userId}. Initiating Rollback...`);

      this.userService.rollbackUser(userId);

      try {
        await this.authRepository.rollbackRoles(userId);
      } catch (e) {
        console.error('CRITICAL: Failed to rollback roles locally', e);
      }

      if (error instanceof UserAlreadyExistsError) {
        throw error;
      }

      throw new SagaCompensationError(
        error instanceof Error ? error.message : 'Registration Failed',
      );
    }
  }
}
