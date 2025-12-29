import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { IUserIntegrationService } from '../../domain/interfaces/user-integration.interface';

@Injectable()
export class UserIntegrationAdapter implements IUserIntegrationService {
  constructor(@Inject('MEDIA_RMQ') private readonly rmqClient: ClientProxy) {}

  notifyAvatarUpdated(userId: string, avatarUrl: string): void {
    this.rmqClient.emit('user.avatar_updated', { userId, avatarUrl });
  }
}
