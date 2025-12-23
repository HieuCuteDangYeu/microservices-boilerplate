import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import { isRpcError } from '@common/user/interfaces/rpc-error.types';
import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Res,
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
          if (isRpcError(error)) {
            throw new HttpException(error.message, error.statusCode);
          }

          const errorMessage =
            error instanceof Error ? error.message : 'Internal Server Error';

          throw new HttpException(errorMessage, 500);
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
          if (isRpcError(error))
            throw new HttpException(error.message, error.statusCode);
          throw new HttpException('Login failed', 401);
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
}
