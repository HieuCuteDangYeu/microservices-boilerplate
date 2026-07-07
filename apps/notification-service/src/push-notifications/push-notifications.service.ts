import { Injectable } from '@nestjs/common';

import { FirebaseAdminService } from '../firebase-admin/firebase-admin.service';
import { NotificationJobsService } from '../notification-jobs/notification-jobs.service';
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

type PushTokenSendResult = {
  tokenId: string;
  platform: string;
  ok: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

type SendNotificationResult = {
  recipientUserId: string;
  totalTokens: number;
  sentCount: number;
  failedCount: number;
  results: PushTokenSendResult[];
};

@Injectable()
export class PushNotificationsService {
  constructor(
    private readonly notificationJobsService: NotificationJobsService,
    private readonly pushTokensService: PushTokensService,
    private readonly firebaseAdminService: FirebaseAdminService,
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

    await this.notificationJobsService.markProcessing(job.id);

    const tokens = await this.pushTokensService.findActiveByUserId(
      input.recipientUserId,
    );

    if (tokens.length === 0) {
      await this.notificationJobsService.markSkipped(
        job.id,
        'No active FCM tokens for recipient user',
      );

      return {
        jobId: job.id,
        status: 'skipped',
        sendResult: {
          recipientUserId: input.recipientUserId,
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendToToken(job.id, token, input)),
    );

    const sentCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - sentCount;

    if (sentCount > 0) {
      await this.notificationJobsService.markSent(job.id);
    } else {
      await this.notificationJobsService.markFailed(
        job.id,
        this.buildFailureSummary(results),
      );
    }

    return {
      jobId: job.id,
      status: sentCount > 0 ? 'sent' : 'failed',
      sendResult: {
        recipientUserId: input.recipientUserId,
        totalTokens: tokens.length,
        sentCount,
        failedCount,
        results,
      } satisfies SendNotificationResult,
    };
  }

  private async sendToToken(
    jobId: string,
    token: ActivePushToken,
    input: SendNewMessageNotificationInput,
  ): Promise<PushTokenSendResult> {
    try {
      const messageId = await this.firebaseAdminService.sendToToken({
        token: token.token,
        title: input.title,
        body: input.body,
        data: {
          type: 'NEW_MESSAGE',
          notificationJobId: jobId,
          recipientUserId: input.recipientUserId,
          actorUserId: input.actorUserId,
          conversationId: input.conversationId,
          messageId: input.messageId,
        },
      });

      return {
        tokenId: token.id,
        platform: token.platform,
        ok: true,
        messageId,
      };
    } catch (error) {
      const errorCode = this.readErrorCode(error);
      const errorMessage = this.readErrorMessage(error);

      if (this.shouldDeactivateToken(errorCode)) {
        await this.pushTokensService.deactivateById(token.id);
      }

      return {
        tokenId: token.id,
        platform: token.platform,
        ok: false,
        errorCode,
        errorMessage,
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
}
