import { Injectable } from '@nestjs/common';

import { Prisma } from '@prisma/notification-client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateNotificationJobInput = {
  type: 'NEW_MESSAGE';
  recipientUserId: string;
  actorUserId?: string;
  conversationId?: string;
  messageId?: string;
  title: string;
  body: string;
  dataJson?: Prisma.InputJsonValue;
};

export type NotificationJobRecord = Prisma.NotificationJobGetPayload<{
  select: {
    id: true;
    type: true;
    recipientUserId: true;
    actorUserId: true;
    conversationId: true;
    messageId: true;
    title: true;
    body: true;
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
        title: input.title,
        body: input.body,
        dataJson: input.dataJson,
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
    return this.prisma.notificationJob.findMany({
      where: {
        OR: [
          {
            status: 'pending',
          },
          {
            status: 'failed',
            nextAttemptAt: {
              lte: new Date(),
            },
          },
        ],
        type: 'NEW_MESSAGE',
      },
      select: {
        id: true,
        type: true,
        recipientUserId: true,
        actorUserId: true,
        conversationId: true,
        messageId: true,
        title: true,
        body: true,
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
