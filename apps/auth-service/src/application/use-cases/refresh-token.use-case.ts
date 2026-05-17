import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
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

      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        username: payload.username,
        picture: payload.picture ?? undefined,
        isVerified: payload.isVerified,
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
      console.error(error);
      throw new InvalidTokenError();
    }
  }
}
