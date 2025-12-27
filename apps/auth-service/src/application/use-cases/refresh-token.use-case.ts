import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    @Inject('IUserService') private readonly userService: IUserService,
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

      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        roles: roles,
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
