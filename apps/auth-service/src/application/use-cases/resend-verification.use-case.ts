import { ResendVerificationDto } from '@common/auth/dtos/resend-verification.dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { IMailService } from '../../domain/interfaces/mail-service.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import type { IVerificationCodeRepository } from '../../domain/interfaces/verification-code.repository.interface';

@Injectable()
export class ResendVerificationUseCase {
  constructor(
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IMailService') private readonly mailService: IMailService,
    @Inject('IVerificationCodeRepository')
    private readonly verificationRepo: IVerificationCodeRepository,
  ) {}

  async execute(dto: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) {
      return { message: 'If account exists, verification email sent.' };
    }

    if (user.isVerified) {
      return { message: 'Account is already verified' };
    }

    const newToken = randomBytes(32).toString('hex');

    await this.verificationRepo.save(newToken, user.id, 86400);
    this.mailService.sendConfirmationEmail(user.email, newToken);

    return { message: 'Verification email resent successfully' };
  }
}
