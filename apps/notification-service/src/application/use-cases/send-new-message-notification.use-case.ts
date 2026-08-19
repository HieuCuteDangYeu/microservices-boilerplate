import { Inject, Injectable } from '@nestjs/common';

import { INotificationJobRepository } from '../../domain/interfaces/notification-job.repository.interface';
import { ProcessNotificationJobUseCase } from './process-notification-job.use-case';

export type SendNewMessageNotificationInput = {
  recipientUserIds: string[];
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
    const recipientUserIds = Array.from(
      new Set(
        input.recipientUserIds
          .map((recipientUserId) => recipientUserId.trim())
          .filter(Boolean),
      ),
    );

    const results = await Promise.all(
      recipientUserIds.map(async (recipientUserId) => {
        const job = await this.notificationJobRepository.create({
          type: 'NEW_MESSAGE',
          recipientUserId,
          actorUserId: input.actorUserId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          title: input.title,
          body: input.body,
          dataJson: {
            type: 'NEW_MESSAGE',
          },
        });

        return {
          recipientUserId,
          result: await this.processNotificationJob.execute(job),
        };
      }),
    );

    return {
      recipientCount: recipientUserIds.length,
      results,
    };
  }
}
