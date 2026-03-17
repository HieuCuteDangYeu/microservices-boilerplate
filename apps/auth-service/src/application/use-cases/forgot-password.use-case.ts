import { ForgotPasswordDto } from '@common/auth/dtos/forgot-password.dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { IMailService } from '../../domain/interfaces/mail-service.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import type { IVerificationCodeRepository } from '../../domain/interfaces/verification-code.repository.interface';

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IMailService') private readonly mailService: IMailService,
    @Inject('IVerificationCodeRepository')
    private readonly redisRepository: IVerificationCodeRepository,
  ) {}

  async execute(dto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) return { message: 'If email exists, reset instructions sent.' };

    const token = randomInt(100000, 1000000).toString();

    await this.redisRepository.save(`reset_password:${token}`, user.id, 900);

    this.mailService.sendPasswordResetEmail(user.email, token);

    return { message: 'If email exists, reset instructions sent.' };
  }
}
