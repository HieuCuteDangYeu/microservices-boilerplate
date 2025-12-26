import { AccountNotVerifiedError } from '@auth/domain/errors/account-not-verified.error';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject('IUserService') private readonly userService: IUserService,
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.userService.validateUser(dto);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isVerified) {
      throw new AccountNotVerifiedError();
    }

    const roles = await this.authRepository.getUserRole(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: roles,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.authRepository.createRefreshToken(
      user.id,
      refreshToken,
      expiresAt,
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
