import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserRoleRepository')
    private readonly roleCache: IUserRoleRepository,
  ) {}

  async execute(token: string): Promise<void> {
    const storedToken = await this.authRepository.findRefreshToken(token);

    if (storedToken) {
      await this.authRepository.updateRefreshToken(storedToken.id, {
        revoked: true,
      });

      if (storedToken.userId) {
        await this.roleCache.invalidateUserRoles(storedToken.userId);
      }
    }
  }
}
