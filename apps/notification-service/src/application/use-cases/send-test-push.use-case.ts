import { Inject, Injectable } from '@nestjs/common';

import { ActiveFcmPushTokenNotFoundError } from '../../domain/errors/notification.errors';
import { IFcmPushGateway } from '../../domain/interfaces/fcm-push.gateway.interface';
import { IPushTokenRepository } from '../../domain/interfaces/push-token.repository.interface';

export type SendTestPushInput = {
  title?: string;
  body?: string;
};

@Injectable()
export class SendTestPushUseCase {
  constructor(
    @Inject('IPushTokenRepository')
    private readonly pushTokenRepository: IPushTokenRepository,
    @Inject('IFcmPushGateway')
    private readonly fcmPushGateway: IFcmPushGateway,
  ) {}

  async execute(input: SendTestPushInput) {
    const pushToken = await this.pushTokenRepository.findLatestActiveFcm();

    if (!pushToken) {
      throw new ActiveFcmPushTokenNotFoundError();
    }

    const messageId = await this.fcmPushGateway.send({
      token: pushToken.token,
      title: input.title ?? 'Velora test notification',
      body: input.body ?? 'Backend Firebase Admin is working.',
      data: {
        type: 'DEV_TEST',
        source: 'notification-service',
      },
    });

    return {
      messageId,
      pushToken,
    };
  }
}
