import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from './jwt-auth.guard';

@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    const targetUserId = request.params.id;

    if (!user) {
      return false;
    }

    const isAdmin = user.roles && user.roles.includes('ADMIN');

    if (isAdmin) {
      return true;
    }

    if (user.id !== targetUserId) {
      throw new ForbiddenException(
        'Access Denied: You can only manage your own resources.',
      );
    }

    return true;
  }
}
