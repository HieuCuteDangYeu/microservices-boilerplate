import { Injectable } from '@nestjs/common';

import { Prisma } from '@prisma/notification-client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateNotificationJobInput = {
  type: 'NEW_MESSAGE' | 'INCOMING_CALL';
  recipientUserId: string;
  actorUserId?: string;
  conversationId?: string;
  messageId?: string;
  callId?: string;
  title: string;
  body: string;
  dataJson?: Prisma.InputJsonValue;
  expiresAt?: Date;
};

export type NotificationJobRecord = Prisma.NotificationJobGetPayload<{
  select: {
    id: true;
    type: true;
    recipientUserId: true;
    actorUserId: true;
    conversationId: true;
    messageId: true;
    callId: true;
    title: true;
    body: true;
    dataJson: true;
    expiresAt: true;
    status: true;
    attemptCount: true;
    nextAttemptAt: true;
  };
}>;

@Injectable()
export class NotificationJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(input: CreateNotificationJobInput) {
    return this.prisma.notificationJob.create({
      data: {
        type: input.type,
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        callId: input.callId,
        title: input.title,
        body: input.body,
        dataJson: input.dataJson,
        expiresAt: input.expiresAt,
        status: 'pending',
      },
    });
  }

  async markProcessing(id: string) {
    return this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'processing',
        attemptCount: {
          increment: 1,
        },
      },
    });
  }

  async markSent(id: string) {
    return this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      },
    });
  }

  async markFailed(id: string, error: string, nextAttemptAt?: Date) {
    return this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'failed',
        lastError: error,
        nextAttemptAt,
        sentAt: null,
      },
    });
  }

  async markSkipped(id: string, reason: string) {
    return this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'skipped',
        lastError: reason,
        nextAttemptAt: null,
        sentAt: null,
      },
    });
  }

  async findRetryableJobs(limit: number): Promise<NotificationJobRecord[]> {
    const now = new Date();

    return this.prisma.notificationJob.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                status: 'pending',
              },
              {
                status: 'failed',
                nextAttemptAt: {
                  lte: now,
                },
              },
            ],
          },
          {
            OR: [
              {
                expiresAt: null,
              },
              {
                expiresAt: {
                  gt: now,
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        type: true,
        recipientUserId: true,
        actorUserId: true,
        conversationId: true,
        messageId: true,
        callId: true,
        title: true,
        body: true,
        dataJson: true,
        expiresAt: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }
}
