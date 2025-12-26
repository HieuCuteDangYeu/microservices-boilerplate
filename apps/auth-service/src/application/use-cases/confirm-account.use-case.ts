import { InvalidTokenError } from '@auth/domain/errors/invalid-token.error';
import { ConfirmAccountDto } from '@common/auth/dtos/confirm-account.dto';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import type { IVerificationCodeRepository } from '../../domain/interfaces/verification-code.repository.interface';

@Injectable()
export class ConfirmAccountUseCase {
  constructor(
    @Inject('IVerificationCodeRepository')
    private readonly verificationRepo: IVerificationCodeRepository,
    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(dto: ConfirmAccountDto): Promise<{ message: string }> {
    const userId = await this.verificationRepo.getUserId(dto.token);

    if (!userId) {
      throw new InvalidTokenError();
    }

    await this.userService.verifyUser(userId);
    await this.verificationRepo.delete(dto.token);

    return { message: 'Account verified successfully' };
  }
}
