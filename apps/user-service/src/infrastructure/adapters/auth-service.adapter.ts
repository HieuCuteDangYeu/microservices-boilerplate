import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { IAuthService } from '../../domain/interfaces/auth-service.interface';

@Injectable()
export class AuthServiceAdapter implements IAuthService {
  constructor(
    @Inject('AUTH_SERVICE_CLIENT') private readonly client: ClientProxy,
  ) {}

  deleteUserRoles(userId: string): void {
    this.client.emit('auth.delete_user_roles', { userId });
  }
}
