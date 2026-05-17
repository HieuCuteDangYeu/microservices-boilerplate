import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class VerifyTokenUseCase {
  private readonly logger = new Logger(VerifyTokenUseCase.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserRoleRepository')
    private readonly roleCache: IUserRoleRepository,
  ) {}

  async execute(token: string): Promise<AuthUser> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

    let roles: string[] | null = null;

    try {
      roles = await this.roleCache.getUserRoles(payload.sub);
    } catch (error) {
      this.logger.warn(
        `Failed to read cached roles for user ${payload.sub}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!roles) {
      roles = await this.authRepository.getUserRole(payload.sub);

      try {
        await this.roleCache.setUserRoles(payload.sub, roles);
      } catch (error) {
        this.logger.warn(
          `Failed to cache roles for user ${payload.sub}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      picture: payload.picture,
      roles: roles,
    };
  }
}
