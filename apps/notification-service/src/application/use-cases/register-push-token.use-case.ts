import { Inject, Injectable } from '@nestjs/common';

import {
  PushToken,
  RegisterPushTokenInput,
} from '../../domain/entities/push-token.entity';
import { PushTokenLifecycleConflictError } from '../../domain/errors/notification.errors';
import { IPushTokenLifecycleRepository } from '../../domain/interfaces/push-token-lifecycle.repository.interface';
import { IPushTokenRepository } from '../../domain/interfaces/push-token.repository.interface';

@Injectable()
export class RegisterPushTokenUseCase {
  constructor(
    @Inject('IPushTokenRepository')
    private readonly pushTokenRepository: IPushTokenRepository,
    @Inject('IPushTokenLifecycleRepository')
    private readonly lifecycleRepository: IPushTokenLifecycleRepository,
  ) {}

  async execute(
    userId: string,
    input: RegisterPushTokenInput,
  ): Promise<PushToken> {
    if (
      input.lifecycleVersion !== undefined &&
      !(await this.lifecycleRepository.advance(input, 'register'))
    ) {
      throw new PushTokenLifecycleConflictError();
    }

    const pushToken = await this.pushTokenRepository.upsert(userId, input);

    if (
      input.lifecycleVersion !== undefined &&
      !(await this.lifecycleRepository.isCurrent(input, 'register'))
    ) {
      await this.pushTokenRepository.deactivateRegistration(userId, input);
      throw new PushTokenLifecycleConflictError();
    }

    if (input.deviceId) {
      await this.pushTokenRepository.deactivateOtherDeviceTokens(userId, input);
    }

    return pushToken;
  }
}
