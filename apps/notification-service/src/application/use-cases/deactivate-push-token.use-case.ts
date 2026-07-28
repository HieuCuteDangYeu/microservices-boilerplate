import { Inject, Injectable } from '@nestjs/common';

import { DeactivatePushTokenInput } from '../../domain/entities/push-token.entity';
import { IPushTokenLifecycleRepository } from '../../domain/interfaces/push-token-lifecycle.repository.interface';
import {
  IPushTokenRepository,
  UpdateCount,
} from '../../domain/interfaces/push-token.repository.interface';

@Injectable()
export class DeactivatePushTokenUseCase {
  constructor(
    @Inject('IPushTokenRepository')
    private readonly pushTokenRepository: IPushTokenRepository,
    @Inject('IPushTokenLifecycleRepository')
    private readonly lifecycleRepository: IPushTokenLifecycleRepository,
  ) {}

  async execute(
    userId: string,
    input: DeactivatePushTokenInput,
  ): Promise<UpdateCount> {
    if (
      input.lifecycleVersion !== undefined &&
      !(await this.lifecycleRepository.advance(input, 'deactivate'))
    ) {
      return { count: 0 };
    }

    return this.pushTokenRepository.deactivate(
      userId,
      input,
      input.lifecycleVersion !== undefined,
    );
  }
}
