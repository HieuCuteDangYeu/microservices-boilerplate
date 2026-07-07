import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';

@Injectable()
export class NotificationServiceAdapter {
  private readonly logger = new Logger(NotificationServiceAdapter.name);
  private readonly notificationServiceUrl: string;
  private readonly internalSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.notificationServiceUrl = (
      this.configService.get<string>('NOTIFICATION_SERVICE_URL') ||
      'http://localhost:3015'
    ).replace(/\/$/, '');
    this.internalSecret = this.configService.get<string>(
      'NOTIFICATION_INTERNAL_SECRET',
    );
  }

  async notifyNewMessage(
    conversation: Conversation | null,
    message: Message,
    actorUserId: string,
  ) {
    if (!conversation || conversation.isGroup) {
      return;
    }

    if (conversation.participantIds.length !== 2) {
      return;
    }

    const recipientUserId = conversation.participantIds.find(
      (participantId) => participantId !== actorUserId,
    );

    if (!recipientUserId) {
      return;
    }

    if (!this.internalSecret) {
      this.logger.warn(
        'Skipping new-message notification because NOTIFICATION_INTERNAL_SECRET is missing',
      );
      return;
    }

    let response: Response;

    try {
      response = await fetch(
        `${this.notificationServiceUrl}/notifications/internal/new-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': this.internalSecret,
          },
          body: JSON.stringify({
            recipientUserId,
            actorUserId,
            conversationId: message.conversationId,
            messageId: message.id,
            title: 'New message',
            body: 'You have a new message from Velora.',
          }),
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Failed to call notification-service for message ${message.id}: ${errorMessage}`,
      );
      return;
    }

    if (response.ok) {
      return;
    }

    const responseText = await response.text();

    this.logger.warn(
      `notification-service rejected message ${message.id} with status ${response.status}: ${responseText}`,
    );
  }
}
