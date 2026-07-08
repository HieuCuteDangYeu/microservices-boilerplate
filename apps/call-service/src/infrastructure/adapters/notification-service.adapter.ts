import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CallLifecycleEvent,
  CallLifecyclePayload,
} from '../../domain/interfaces/call-event.publisher.interface';

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

  async notifyCallLifecycle(
    event: CallLifecycleEvent,
    payload: CallLifecyclePayload,
  ) {
    if (!this.internalSecret) {
      this.logger.warn(
        'Skipping call notification because NOTIFICATION_INTERNAL_SECRET is missing',
      );
      return;
    }

    if (event === 'call.initiated') {
      await this.post('/notifications/internal/incoming-call', {
        recipientUserId: payload.recipientUserId,
        initiatorId: payload.initiatorId,
        targetUserId: payload.targetUserId,
        conversationId: payload.conversationId,
        callId: payload.callId,
        callType: payload.callType,
        initiatorDisplayName: payload.initiatorDisplayName,
        initiatorAvatarUrl: payload.initiatorAvatarUrl,
        ringTimeoutMs: payload.ringTimeoutMs,
        expiresAt: payload.expiresAt,
      });
      return;
    }

    await this.post('/notifications/internal/call-state-update', {
      recipientUserIds: [...new Set([payload.initiatorId, payload.targetUserId])],
      conversationId: payload.conversationId,
      callId: payload.callId,
      status: this.mapCallState(event, payload.reason),
      reason: payload.reason,
      at: payload.at,
    });
  }

  private mapCallState(event: CallLifecycleEvent, reason?: string) {
    if (event === 'call.answered') {
      return 'active';
    }

    if (event === 'call.rejected') {
      return 'rejected';
    }

    return reason === 'cancelled' ? 'cancelled' : 'ended';
  }

  private async post(path: string, body: Record<string, unknown>) {
    let response: Response;

    try {
      response = await fetch(`${this.notificationServiceUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.internalSecret!,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to call notification-service ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (response.ok) {
      return;
    }

    this.logger.warn(
      `notification-service rejected ${path} with status ${response.status}: ${await response.text()}`,
    );
  }
}
