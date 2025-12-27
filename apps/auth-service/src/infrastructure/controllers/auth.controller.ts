import { ConfirmAccountUseCase } from '@auth/application/use-cases/confirm-account.use-case';
import { GoogleLoginUseCase } from '@auth/application/use-cases/google-login.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { LogoutUseCase } from '@auth/application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '@auth/application/use-cases/refresh-token.use-case';
import { ResendVerificationUseCase } from '@auth/application/use-cases/resend-verification.use-case';
import { AccountNotVerifiedError } from '@auth/domain/errors/account-not-verified.error';
import { InvalidTokenError } from '@auth/domain/errors/invalid-token.error';
import { ConfirmAccountDto } from '@common/auth/dtos/confirm-account.dto';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { ResendVerificationDto } from '@common/auth/dtos/resend-verification.dto';
import type { GoogleProfile } from '@common/auth/interfaces/google-profile.interface';
import { JwtPayload } from '@common/auth/interfaces/jwt-payload.interface';
import { SagaCompensationError } from '@common/domain/errors/saga.error';
import { Controller } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';

@Controller()
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly jwtService: JwtService,
    private readonly confirmAccountUseCase: ConfirmAccountUseCase,
    private readonly resendVerificationUseCase: ResendVerificationUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly googleLoginUseCase: GoogleLoginUseCase,
  ) {}

  @MessagePattern('auth.register')
  async register(@Payload() dto: RegisterDto) {
    try {
      return await this.registerUseCase.execute(dto);
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        throw new RpcException({
          statusCode: 409,
          message: error.message,
        });
      }

      if (error instanceof SagaCompensationError) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: 'Internal Server Error',
      });
    }
  }

  @MessagePattern('auth.login')
  async login(@Payload() dto: LoginDto) {
    try {
      return await this.loginUseCase.execute(dto);
    } catch (error) {
      if (error instanceof AccountNotVerifiedError) {
        throw new RpcException({
          statusCode: 403,
          message: error.message,
        });
      }

      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    }
  }

  @MessagePattern('auth.verify_token')
  async verifyToken(@Payload() data: { token: string }) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(data.token);

      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid Token',
      });
    }
  }

  @MessagePattern('auth.confirm_account')
  async handleConfirmAccount(@Payload() dto: ConfirmAccountDto) {
    try {
      return await this.confirmAccountUseCase.execute(dto);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }
      throw error;
    }
  }

  @MessagePattern('auth.resend_verification')
  async handleResendVerification(@Payload() dto: ResendVerificationDto) {
    try {
      return await this.resendVerificationUseCase.execute(dto);
    } catch (error) {
      console.error(error);
      throw new RpcException({
        statusCode: 500,
        message: 'Failed to resend verification email',
      });
    }
  }

  @MessagePattern('auth.refresh')
  async refresh(@Payload() data: { refreshToken: string }) {
    try {
      return await this.refreshTokenUseCase.execute(data.refreshToken);
    } catch (error) {
      console.error(error);
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid or expired refresh token',
      });
    }
  }

  @MessagePattern('auth.logout')
  async logout(@Payload() data: { refreshToken: string }) {
    await this.logoutUseCase.execute(data.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @MessagePattern('auth.login_google')
  async loginGoogle(@Payload() profile: GoogleProfile) {
    return await this.googleLoginUseCase.execute(profile);
  }
}
