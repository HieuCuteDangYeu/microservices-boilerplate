import { ConfirmAccountDto } from '@common/auth/dtos/confirm-account.dto';
import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
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

    response.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }

    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
