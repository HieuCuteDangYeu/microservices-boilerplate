import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class VerifyTokenUseCase {
  private readonly logger = new Logger(VerifyTokenUseCase.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserService') private readonly userService: IUserService,
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

    let fullName = payload.fullName;
    let username = payload.username;
    let picture = payload.picture;
    let isVerified = payload.isVerified;

    if (fullName === undefined || username === undefined) {
      const user = await this.userService.findByEmail(payload.email);

      if (user) {
        fullName = user.fullName;
        username = user.username;
        picture = user.picture ?? picture;
        isVerified = user.isVerified ?? isVerified;
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      fullName,
      username,
      picture,
      isVerified,
      roles: roles,
    };
  }
}
