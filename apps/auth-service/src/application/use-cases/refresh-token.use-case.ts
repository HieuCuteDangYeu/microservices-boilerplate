import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IUserRoleRepository')
    private readonly roleCache: IUserRoleRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(incomingRefreshToken: string): Promise<TokenResponse> {
    try {
      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(incomingRefreshToken);

      const storedToken =
        await this.authRepository.findRefreshToken(incomingRefreshToken);

      if (!storedToken || storedToken.revoked) {
        await this.authRepository.revokeAllUserTokens(payload.sub);
        throw new InvalidTokenError();
      }

      if (storedToken.expiresAt < new Date()) {
        throw new InvalidTokenError();
      }

      await this.authRepository.updateRefreshToken(storedToken.id, {
        revoked: true,
      });

      const roles = await this.authRepository.getUserRole(payload.sub);

      try {
        await this.roleCache.setUserRoles(payload.sub, roles);
      } catch (error) {
        this.logger.warn(
          `Failed to cache roles for user ${payload.sub}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const user = await this.userService.findById(payload.sub);

      if (!user) {
        throw new InvalidTokenError();
      }

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        picture: user.picture ?? undefined,
        isVerified: user.isVerified,
      };

      const accessToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: '15m',
      });
      const refreshToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: '7d',
        jwtid: randomUUID(),
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.authRepository.createRefreshToken(
        payload.sub,
        refreshToken,
        expiresAt,
      );

      return { accessToken, refreshToken };
    } catch (error) {
      if (!(error instanceof InvalidTokenError)) {
        this.logger.error(
          'Failed to refresh token',
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw new InvalidTokenError();
    }
  }
}
