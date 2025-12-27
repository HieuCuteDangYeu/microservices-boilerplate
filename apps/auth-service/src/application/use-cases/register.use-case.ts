import { RegisterDto } from '@common/auth/dtos/register.dto';
import { SagaCompensationError } from '@common/domain/errors/saga.error';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import { Inject, Injectable } from '@nestjs/common';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { randomBytes } from 'crypto';
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
    let result: CreateUserResponse | null = null;

    try {
      result = await this.userService.createUser(dto);

      await this.authRepository.assignRole(result.id, 'USER');

      const token = randomBytes(32).toString('hex');
      await this.verificationRepo.save(token, result.id, 86400);

      this.mailService.sendConfirmationEmail(result.email, token);

      return {
        id: result.id,
        email: result.email,
        message: 'User registered successfully',
      };
    } catch (error) {
      if (result && result.id) {
        console.error(
          `Saga Failed for User ${result.id}. Initiating Rollback...`,
        );

        this.userService.rollbackUser(result.id);

        try {
          await this.authRepository.rollbackRoles(result.id);
        } catch (e) {
          console.error('CRITICAL: Failed to rollback roles locally', e);
        }
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
