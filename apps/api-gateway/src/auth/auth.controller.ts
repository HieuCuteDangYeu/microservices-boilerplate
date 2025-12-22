import { RegisterDto } from '@common/auth/dtos/register.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';
import { isRpcError } from '@common/user/interfaces/rpc-error.types';
import { Body, Controller, HttpException, Inject, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
