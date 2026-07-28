import { Inject, Injectable } from '@nestjs/common';

import { PushToken } from '../../domain/entities/push-token.entity';
import { IFcmPushGateway } from '../../domain/interfaces/fcm-push.gateway.interface';
import { IPushTokenRepository } from '../../domain/interfaces/push-token.repository.interface';

export type SendCallStateUpdateInput = {
  recipientUserIds: string[];
  iosRecipientUserIds?: string[];
  conversationId: string;
  callId: string;
  status: 'active' | 'rejected' | 'ended' | 'cancelled';
  reason?: string;
  at: string;
};

type PushTokenSendResult = {
  tokenId: string;
  provider: string;
  platform: string;
  ok: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

@Injectable()
export class SendCallStateUpdateUseCase {
  constructor(
    @Inject('IPushTokenRepository')
    private readonly pushTokenRepository: IPushTokenRepository,
    @Inject('IFcmPushGateway')
    private readonly fcmPushGateway: IFcmPushGateway,
  ) {}

  async execute(input: SendCallStateUpdateInput) {
    const uniqueRecipientIds = [...new Set(input.recipientUserIds)];
    const androidTokenGroups = await Promise.all(
      uniqueRecipientIds.map((userId) =>
        this.pushTokenRepository.findActiveByUserId(userId, {
          provider: 'fcm',
          platform: 'android',
        }),
      ),
    );
    const iosRecipientUserIds = [
      ...new Set(
        input.iosRecipientUserIds ??
          (input.status === 'active' ? [] : uniqueRecipientIds),
      ),
    ];
    const iosTokenGroups = await Promise.all(
      iosRecipientUserIds.map((userId) =>
        this.pushTokenRepository.findActiveByUserId(userId, {
          provider: 'fcm',
          platform: 'ios',
        }),
      ),
    );
    const tokens = [...androidTokenGroups.flat(), ...iosTokenGroups.flat()];

    if (tokens.length === 0) {
      return {
        status: 'skipped',
        sendResult: {
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        },
      };
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendToToken(token, input)),
    );
    const sentCount = results.filter((result) => result.ok).length;

    return {
      status: sentCount > 0 ? 'sent' : 'failed',
      sendResult: {
        totalTokens: results.length,
        sentCount,
        failedCount: results.length - sentCount,
        results,
      },
    };
  }

  private async sendToToken(
    token: PushToken,
    input: SendCallStateUpdateInput,
  ): Promise<PushTokenSendResult> {
    try {
      const messageId = await this.fcmPushGateway.send({
        token: token.token,
        includeNotification: false,
        data: {
          type: 'CALL_STATE_UPDATE',
          callId: input.callId,
          recipientUserId: token.userId,
          conversationId: input.conversationId,
          status: input.status,
          reason: input.reason,
          at: input.at,
        },
        ...(token.platform === 'ios'
          ? {
              apnsContentAvailable: true,
              apnsBackground: true,
            }
          : {}),
      });

      return {
        tokenId: token.id,
        provider: token.provider,
        platform: token.platform,
        ok: true,
        messageId,
      };
    } catch (error) {
      const errorCode = this.readErrorCode(error);

      if (this.shouldDeactivateToken(errorCode)) {
        await this.pushTokenRepository.deactivateById(token.id);
      }

      return {
        tokenId: token.id,
        provider: token.provider,
        platform: token.platform,
        ok: false,
        errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private shouldDeactivateToken(errorCode?: string) {
    return (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token'
    );
  }

  private readErrorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = error.code;

      if (typeof code === 'string') {
        return code;
      }
    }

    return undefined;
  }
}
