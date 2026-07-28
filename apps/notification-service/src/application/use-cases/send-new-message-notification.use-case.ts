import { Inject, Injectable } from '@nestjs/common';

import { INotificationJobRepository } from '../../domain/interfaces/notification-job.repository.interface';
import { ProcessNotificationJobUseCase } from './process-notification-job.use-case';

export type SendNewMessageNotificationInput = {
  recipientUserId: string;
  actorUserId: string;
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
};

@Injectable()
export class SendNewMessageNotificationUseCase {
  constructor(
    @Inject('INotificationJobRepository')
    private readonly notificationJobRepository: INotificationJobRepository,
    private readonly processNotificationJob: ProcessNotificationJobUseCase,
  ) {}

  async execute(input: SendNewMessageNotificationInput) {
    const job = await this.notificationJobRepository.create({
      type: 'NEW_MESSAGE',
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      title: input.title,
      body: input.body,
      dataJson: {
        type: 'NEW_MESSAGE',
      },
    });

    return this.processNotificationJob.execute(job);
  }
}
