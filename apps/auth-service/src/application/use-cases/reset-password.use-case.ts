import { InvalidResetTokenError } from '@auth/domain/errors/invalid-reset-token.error';
import type { IUserService } from '@auth/domain/interfaces/user-service.interface';
import type { IVerificationCodeRepository } from '@auth/domain/interfaces/verification-code.repository.interface';
import { ResetPasswordDto } from '@common/auth/dtos/reset-password.dto';
import { UpdateUserPayload } from '@common/user/interfaces/update-user.types';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IVerificationCodeRepository')
    private readonly redisRepository: IVerificationCodeRepository,
  ) {}

  async execute(dto: ResetPasswordDto) {
    const userId = await this.redisRepository.getUserId(
      `reset_password:${dto.token}`,
    );

    if (!userId) {
      throw new InvalidResetTokenError();
    }

    const payload: UpdateUserPayload = {
      id: userId,
      data: {
        password: dto.newPassword,
      },
    };

    await this.userService.updateUser(payload);

    await this.redisRepository.delete(`reset_password:${dto.token}`);

    return { message: 'Password has been reset successfully.' };
  }
}
