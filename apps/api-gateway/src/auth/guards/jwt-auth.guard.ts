import { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request } from 'express';
import { catchError, lastValueFrom, timeout } from 'rxjs';

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  cookies: { [key: string]: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token found');
    }

    try {
      const user = await lastValueFrom(
        this.authClient.send<AuthUser>('auth.verify_token', { token }).pipe(
          timeout(5000),
          catchError(() => {
            throw new UnauthorizedException('Invalid or Expired Token');
          }),
        ),
      );

      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    if (request.cookies && request.cookies['access_token']) {
      return request.cookies['access_token'];
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
