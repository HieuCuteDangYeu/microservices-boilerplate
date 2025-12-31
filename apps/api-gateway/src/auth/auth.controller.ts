import { ConfirmAccountDto } from '@common/auth/dtos/confirm-account.dto';
import { ForgotPasswordDto } from '@common/auth/dtos/forgot-password.dto';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { ResendVerificationDto } from '@common/auth/dtos/resend-verification.dto';
import { ResetPasswordDto } from '@common/auth/dtos/reset-password.dto';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import type { AuthenticatedRequest } from '@gateway/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { catchError, lastValueFrom } from 'rxjs';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto): Promise<CreateUserResponse> {
    return await lastValueFrom(
      this.authClient.send<CreateUserResponse>('auth.register', dto).pipe(
        catchError((error) => {
          this.handleMicroserviceError(error);
        }),
      ),
    );
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and set HTTP-only cookies' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await lastValueFrom(
      this.authClient.send<TokenResponse>('auth.login', dto).pipe(
        catchError((error) => {
          this.handleMicroserviceError(error);
        }),
      ),
    );

    this.setCookies(response, tokens.accessToken, tokens.refreshToken);

    return { message: 'Login successful' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in user session' })
  getProfile(@Req() request: AuthenticatedRequest): AuthUser {
    return request.user!;
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm user account' })
  async confirmAccount(@Body() dto: ConfirmAccountDto) {
    return lastValueFrom(
      this.authClient
        .send<{ message: string }>('auth.confirm_account', dto)
        .pipe(
          catchError((error) => {
            this.handleMicroserviceError(error);
          }),
        ),
    );
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification email' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    return lastValueFrom(
      this.authClient
        .send<{ message: string }>('auth.resend_verification', dto)
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );
  }

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }

    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using cookie' })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const incomingRefreshToken = request.cookies['refresh_token'];

    if (!incomingRefreshToken) {
      throw new HttpException(
        'No refresh token found',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokens = await lastValueFrom(
      this.authClient
        .send<TokenResponse>('auth.refresh', {
          refreshToken: incomingRefreshToken,
        })
        .pipe(
          catchError(() => {
            response.clearCookie('access_token');
            response.clearCookie('refresh_token');
            throw new HttpException(
              'Invalid refresh token',
              HttpStatus.UNAUTHORIZED,
            );
          }),
        ),
    );

    this.setCookies(response, tokens.accessToken, tokens.refreshToken);

    return { message: 'Token refreshed successfully' };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and clear cookies' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refresh_token'];

    if (refreshToken) {
      await lastValueFrom(
        this.authClient.send('auth.logout', { refreshToken }).pipe(
          catchError(() => {
            return [null];
          }),
        ),
      );
    }

    response.clearCookie('access_token');
    response.clearCookie('refresh_token');

    return { message: 'Logged out successfully' };
  }

  private setCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleAuthRedirect(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = req.user as unknown as TokenResponse;

    this.setCookies(res, accessToken, refreshToken);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/api`);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Send forgot password email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return lastValueFrom(
      this.authClient
        .send<{ message: string }>('auth.forgot_password', dto)
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset user password' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return lastValueFrom(
      this.authClient
        .send<{ message: string }>('auth.reset_password', dto)
        .pipe(catchError((err) => this.handleMicroserviceError(err))),
    );
  }
}
