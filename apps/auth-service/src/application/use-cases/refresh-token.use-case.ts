import type { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class RefreshTokenUseCase {
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

      await this.roleCache.setUserRoles(payload.sub, roles);

      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        picture: payload.picture ?? undefined,
      };

      const accessToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: '15m',
      });
      const refreshToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: '7d',
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
