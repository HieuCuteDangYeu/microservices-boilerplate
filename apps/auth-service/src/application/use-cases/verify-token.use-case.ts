import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class VerifyTokenUseCase {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserRoleRepository')
    private readonly roleCache: IUserRoleRepository,
  ) {}

  async execute(token: string): Promise<AuthUser> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

    let roles = await this.roleCache.getUserRoles(payload.sub);

    if (!roles) {
      roles = await this.authRepository.getUserRole(payload.sub);
      await this.roleCache.setUserRoles(payload.sub, roles);
    }

    return {
      id: payload.sub,
      email: payload.email,
      picture: payload.picture,
      roles: roles,
    };
  }
}
