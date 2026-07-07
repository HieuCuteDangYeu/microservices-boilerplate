import { Injectable } from '@nestjs/common';

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

const MAX_NOTIFICATION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;

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

    return this.processJob(job);
  }

  async retryJob(job: NotificationJobRecord) {
    return this.processJob(job);
  }

  private async processJob(job: NotificationJobRecord) {
    const processingJob = await this.notificationJobsService.markProcessing(
      job.id,
    );

    const tokens = await this.pushTokensService.findActiveByUserId(
      processingJob.recipientUserId,
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
          recipientUserId: processingJob.recipientUserId,
          totalTokens: 0,
          sentCount: 0,
          failedCount: 0,
          results: [],
        } satisfies SendNotificationResult,
      };
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendToToken(processingJob, token)),
    );

    const sentCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - sentCount;

    if (sentCount > 0) {
      await this.notificationJobsService.markSent(processingJob.id);
    } else {
      await this.notificationJobsService.markFailed(
        processingJob.id,
        this.buildFailureSummary(results),
        this.buildNextAttemptAt(processingJob.attemptCount),
      );
    }

    return {
      jobId: processingJob.id,
      status: sentCount > 0 ? 'sent' : 'failed',
      sendResult: {
        recipientUserId: processingJob.recipientUserId,
        totalTokens: tokens.length,
        sentCount,
        failedCount,
        results,
      } satisfies SendNotificationResult,
    };
  }

  private async sendToToken(
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

  private buildNextAttemptAt(attemptCount: number) {
    if (attemptCount >= MAX_NOTIFICATION_ATTEMPTS) {
      return undefined;
    }

    return new Date(Date.now() + RETRY_DELAY_MS);
  }
}
