import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';

import { ApnsVoipService } from '../firebase-admin/apns-voip.service';
import { FirebaseAdminService } from '../firebase-admin/firebase-admin.service';
import {
  NotificationJobRecord,
  NotificationJobsService,
} from '../notification-jobs/notification-jobs.service';
import {
  ActivePushToken,
  PushTokensService,
} from '../push-tokens/push-tokens.service';

export type SendNewMessageNotificationInput = {
  recipientUserId: string;
  actorUserId: string;
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
};

export type SendIncomingCallNotificationInput = {
  recipientUserId: string;
  initiatorId: string;
  targetUserId: string;
  conversationId: string;
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  initiatorDisplayName: string;
  initiatorAvatarUrl?: string;
  ringTimeoutMs: number;
  expiresAt: string;
};

export type SendCallStateUpdateInput = {
  recipientUserIds: string[];
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

type SendNotificationResult = {
  totalTokens: number;
  sentCount: number;
  failedCount: number;
  results: PushTokenSendResult[];
};

type VoipDeliveryEnvironment = 'development' | 'production';

const MAX_MESSAGE_NOTIFICATION_ATTEMPTS = 3;
const MAX_CALL_NOTIFICATION_ATTEMPTS = 2;
const MESSAGE_RETRY_DELAY_MS = 60_000;
const CALL_RETRY_DELAY_MS = 3_000;

@Injectable()
export class PushNotificationsService {
  constructor(
    private readonly notificationJobsService: NotificationJobsService,
    private readonly pushTokensService: PushTokensService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly apnsVoipService: ApnsVoipService,
  ) {}

  async sendNewMessage(input: SendNewMessageNotificationInput) {
    const job = await this.notificationJobsService.createJob({
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

    return this.processJob(job);
  }

  async sendIncomingCall(input: SendIncomingCallNotificationInput) {
    const expiresAt = new Date(input.expiresAt);
    const job = await this.notificationJobsService.createJob({
      type: 'INCOMING_CALL',
      recipientUserId: input.recipientUserId,
      actorUserId: input.initiatorId,
      conversationId: input.conversationId,
      callId: input.callId,
      title: input.initiatorDisplayName,
      body: 'Incoming voice call',
      expiresAt,
      dataJson: {
        type: 'INCOMING_CALL',
        callId: input.callId,
        callType: input.callType,
        recipientUserId: input.recipientUserId,
        initiatorId: input.initiatorId,
        targetUserId: input.targetUserId,
        initiatorDisplayName: input.initiatorDisplayName,
        initiatorAvatarUrl: input.initiatorAvatarUrl,
        ringTimeoutMs: input.ringTimeoutMs,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return this.processJob(job);
  }

  async sendCallStateUpdate(input: SendCallStateUpdateInput) {
    const uniqueRecipientIds = [...new Set(input.recipientUserIds)];
    const tokenGroups = await Promise.all(
      uniqueRecipientIds.map(async (userId) => {
        const androidTokensPromise = this.pushTokensService.findActiveByUserId(
          userId,
          {
            provider: 'fcm',
            platform: 'android',
          },
        );

        if (input.status === 'active') {
          return androidTokensPromise;
        }

        const [androidTokens, iosTokens] = await Promise.all([
          androidTokensPromise,
          this.pushTokensService.findActiveByUserId(userId, {
            provider: 'fcm',
            platform: 'ios',
          }),
        ]);

        return [...androidTokens, ...iosTokens];
      }),
    );
    const tokens = tokenGroups.flat();

    if (tokens.length === 0) {
      return {
        status: 'skipped',
        sendResult: {
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendCallStateUpdateToFcmToken(token, input)),
    );

    return {
      status: results.some((result) => result.ok) ? 'sent' : 'failed',
      sendResult: this.buildSendResult(results),
    };
  }

  async retryJob(job: NotificationJobRecord) {
    return this.processJob(job);
  }

  private async processJob(job: NotificationJobRecord) {
    switch (job.type) {
      case 'NEW_MESSAGE':
        return this.processNewMessageJob(job);
      case 'INCOMING_CALL':
        return this.processIncomingCallJob(job);
      default:
        throw new Error(`Unsupported notification job type: ${job.type}`);
    }
  }

  private async processNewMessageJob(job: NotificationJobRecord) {
    const processingJob = await this.notificationJobsService.markProcessing(
      job.id,
    );

    const tokens = await this.pushTokensService.findActiveByUserId(
      processingJob.recipientUserId,
      {
        provider: 'fcm',
      },
    );

    if (tokens.length === 0) {
      await this.notificationJobsService.markSkipped(
        processingJob.id,
        'No active FCM tokens for recipient user',
      );

      return {
        jobId: processingJob.id,
        status: 'skipped',
        sendResult: {
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendNewMessageToToken(processingJob, token)),
    );

    const sendResult = this.buildSendResult(results);

    if (sendResult.sentCount > 0) {
      await this.notificationJobsService.markSent(processingJob.id);
    } else {
      await this.notificationJobsService.markFailed(
        processingJob.id,
        this.buildFailureSummary(results),
        this.buildNextAttemptAt(processingJob),
      );
    }

    return {
      jobId: processingJob.id,
      status: sendResult.sentCount > 0 ? 'sent' : 'failed',
      sendResult,
    };
  }

  private async processIncomingCallJob(job: NotificationJobRecord) {
    const processingJob = await this.notificationJobsService.markProcessing(
      job.id,
    );

    if (
      processingJob.expiresAt &&
      processingJob.expiresAt.getTime() <= Date.now()
    ) {
      await this.notificationJobsService.markSkipped(
        processingJob.id,
        'Incoming call expired before delivery',
      );

      return {
        jobId: processingJob.id,
        status: 'skipped',
        sendResult: {
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const [androidTokens, voipTokens] = await Promise.all([
      this.pushTokensService.findActiveByUserId(processingJob.recipientUserId, {
        provider: 'fcm',
        platform: 'android',
      }),
      this.pushTokensService.findActiveByUserId(processingJob.recipientUserId, {
        provider: 'apns_voip',
        platform: 'ios',
      }),
    ]);

    const tokens = [...androidTokens, ...voipTokens];

    if (tokens.length === 0) {
      await this.notificationJobsService.markSkipped(
        processingJob.id,
        'No active incoming-call delivery tokens for recipient user',
      );

      return {
        jobId: processingJob.id,
        status: 'skipped',
        sendResult: {
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const payload = this.readIncomingCallPayload(processingJob);
    const results = await Promise.all(
      tokens.map((token) =>
        token.provider === 'apns_voip'
          ? this.sendIncomingCallToVoipToken(processingJob, token, payload)
          : this.sendIncomingCallToAndroidToken(processingJob, token, payload),
      ),
    );

    const sendResult = this.buildSendResult(results);

    if (sendResult.sentCount > 0) {
      await this.notificationJobsService.markSent(processingJob.id);
    } else {
      await this.notificationJobsService.markFailed(
        processingJob.id,
        this.buildFailureSummary(results),
        this.buildNextAttemptAt(processingJob),
      );
    }

    return {
      jobId: processingJob.id,
      status: sendResult.sentCount > 0 ? 'sent' : 'failed',
      sendResult,
    };
  }

  private async sendNewMessageToToken(
    job: NotificationJobRecord,
    token: ActivePushToken,
  ): Promise<PushTokenSendResult> {
    try {
      const messageId = await this.firebaseAdminService.sendToToken({
        token: token.token,
        title: job.title,
        body: job.body,
        data: {
          type: 'NEW_MESSAGE',
          notificationJobId: job.id,
          recipientUserId: job.recipientUserId,
          actorUserId: job.actorUserId,
          conversationId: job.conversationId,
          messageId: job.messageId,
        },
      });

      return {
        tokenId: token.id,
        provider: token.provider,
        platform: token.platform,
        ok: true,
        messageId,
      };
    } catch (error) {
      return this.buildFailedTokenResult(token, error);
    }
  }

  private async sendIncomingCallToAndroidToken(
    job: NotificationJobRecord,
    token: ActivePushToken,
    payload: IncomingCallPayload,
  ): Promise<PushTokenSendResult> {
    try {
      const messageId = await this.firebaseAdminService.sendToToken({
        token: token.token,
        includeNotification: false,
        data: {
          type: 'INCOMING_CALL',
          notificationJobId: job.id,
          recipientUserId: job.recipientUserId,
          initiatorId: payload.initiatorId,
          targetUserId: payload.targetUserId,
          conversationId: job.conversationId,
          callId: job.callId,
          actorUserId: job.actorUserId,
          callType: payload.callType,
          initiatorDisplayName: payload.initiatorDisplayName,
          initiatorAvatarUrl: payload.initiatorAvatarUrl,
          ringTimeoutMs: payload.ringTimeoutMs,
          expiresAt: payload.expiresAt,
        },
      });

      return {
        tokenId: token.id,
        provider: token.provider,
        platform: token.platform,
        ok: true,
        messageId,
      };
    } catch (error) {
      return this.buildFailedTokenResult(token, error);
    }
  }

  private async sendIncomingCallToVoipToken(
    job: NotificationJobRecord,
    token: ActivePushToken,
    payload: IncomingCallPayload,
  ): Promise<PushTokenSendResult> {
    try {
      const voipMetadata = this.readVoipTokenMetadata(token);

      await this.apnsVoipService.sendVoipPush({
        token: token.token,
        bundleId: voipMetadata.bundleId,
        deliveryEnvironment: voipMetadata.deliveryEnvironment,
        expiresAt: job.expiresAt ?? undefined,
        payload: {
          aps: {
            'content-available': 1,
          },
          type: 'INCOMING_CALL',
          notificationJobId: job.id,
          recipientUserId: job.recipientUserId,
          initiatorId: payload.initiatorId,
          targetUserId: payload.targetUserId,
          conversationId: job.conversationId,
          callId: job.callId,
          actorUserId: job.actorUserId,
          callType: payload.callType,
          initiatorDisplayName: payload.initiatorDisplayName,
          initiatorAvatarUrl: payload.initiatorAvatarUrl,
          ringTimeoutMs: payload.ringTimeoutMs,
          expiresAt: payload.expiresAt,
        },
      });

      return {
        tokenId: token.id,
        provider: token.provider,
        platform: token.platform,
        ok: true,
      };
    } catch (error) {
      return this.buildFailedTokenResult(token, error);
    }
  }

  private async sendCallStateUpdateToFcmToken(
    token: ActivePushToken,
    input: SendCallStateUpdateInput,
  ): Promise<PushTokenSendResult> {
    try {
      const messageId = await this.firebaseAdminService.sendToToken({
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
      return this.buildFailedTokenResult(token, error);
    }
  }

  private readVoipTokenMetadata(token: ActivePushToken): {
    bundleId: string;
    deliveryEnvironment: VoipDeliveryEnvironment;
  } {
    if (
      !token.bundleId ||
      (token.deliveryEnvironment !== 'development' &&
        token.deliveryEnvironment !== 'production')
    ) {
      throw new Error(
        'Missing bundleId or deliveryEnvironment for APNs VoIP token',
      );
    }

    return {
      bundleId: token.bundleId,
      deliveryEnvironment: token.deliveryEnvironment,
    };
  }

  private async buildFailedTokenResult(
    token: ActivePushToken,
    error: unknown,
  ): Promise<PushTokenSendResult> {
    const errorCode = this.readErrorCode(error);
    const errorMessage = this.readErrorMessage(error);

    if (this.shouldDeactivateToken(errorCode)) {
      await this.pushTokensService.deactivateById(token.id);
    }

    return {
      tokenId: token.id,
      provider: token.provider,
      platform: token.platform,
      ok: false,
      errorCode,
      errorMessage,
    };
  }

  private shouldDeactivateToken(errorCode?: string) {
    return (
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'apns/BadDeviceToken' ||
      errorCode === 'apns/DeviceTokenNotForTopic' ||
      errorCode === 'apns/Unregistered'
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

  private readErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private buildFailureSummary(results: PushTokenSendResult[]) {
    return results
      .filter((result) => !result.ok)
      .map(
        (result) =>
          `${result.tokenId}: ${result.errorCode ?? result.errorMessage ?? 'Unknown error'}`,
      )
      .join('; ');
  }

  private buildNextAttemptAt(job: NotificationJobRecord) {
    switch (job.type) {
      case 'NEW_MESSAGE':
        if (job.attemptCount >= MAX_MESSAGE_NOTIFICATION_ATTEMPTS) {
          return undefined;
        }

        return new Date(Date.now() + MESSAGE_RETRY_DELAY_MS);
      case 'INCOMING_CALL': {
        if (
          job.attemptCount >= MAX_CALL_NOTIFICATION_ATTEMPTS ||
          !job.expiresAt
        ) {
          return undefined;
        }

        const nextAttemptAt = new Date(Date.now() + CALL_RETRY_DELAY_MS);

        if (nextAttemptAt.getTime() >= job.expiresAt.getTime()) {
          return undefined;
        }

        return nextAttemptAt;
      }
      default:
        return undefined;
    }
  }

  private buildSendResult(
    results: PushTokenSendResult[],
  ): SendNotificationResult {
    const sentCount = results.filter((result) => result.ok).length;

    return {
      totalTokens: results.length,
      sentCount,
      failedCount: results.length - sentCount,
      results,
    };
  }

  private readIncomingCallPayload(
    job: NotificationJobRecord,
  ): IncomingCallPayload {
    const data = this.readDataJson(job.dataJson);

    return {
      initiatorId:
        typeof data.initiatorId === 'string' && data.initiatorId.trim()
          ? data.initiatorId
          : (job.actorUserId ?? ''),
      targetUserId:
        typeof data.targetUserId === 'string' && data.targetUserId.trim()
          ? data.targetUserId
          : job.recipientUserId,
      callType: data.callType === 'VIDEO' ? 'VIDEO' : 'VOICE',
      initiatorDisplayName:
        typeof data.initiatorDisplayName === 'string' &&
        data.initiatorDisplayName.trim()
          ? data.initiatorDisplayName
          : job.title,
      initiatorAvatarUrl:
        typeof data.initiatorAvatarUrl === 'string' &&
        data.initiatorAvatarUrl.trim()
          ? data.initiatorAvatarUrl
          : undefined,
      ringTimeoutMs:
        typeof data.ringTimeoutMs === 'number' &&
        Number.isFinite(data.ringTimeoutMs)
          ? data.ringTimeoutMs
          : 30_000,
      expiresAt:
        typeof data.expiresAt === 'string' && data.expiresAt.trim()
          ? data.expiresAt
          : (job.expiresAt?.toISOString() ?? new Date().toISOString()),
    };
  }

  private readDataJson(
    dataJson: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (dataJson && typeof dataJson === 'object' && !Array.isArray(dataJson)) {
      return dataJson;
    }

    return {};
  }
}

type IncomingCallPayload = {
  initiatorId: string;
  targetUserId: string;
  callType: 'VOICE' | 'VIDEO';
  initiatorDisplayName: string;
  initiatorAvatarUrl?: string;
  ringTimeoutMs: number;
  expiresAt: string;
};
