import { Injectable } from '@nestjs/common';
import {
  NotificationJob as PrismaNotificationJob,
  Prisma,
} from '@prisma/notification-client';

import {
  CreateNotificationJobInput,
  NotificationJob,
  NotificationJobStatus,
  NotificationJobType,
} from '../../domain/entities/notification-job.entity';
import { INotificationJobRepository } from '../../domain/interfaces/notification-job.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaNotificationJobRepository implements INotificationJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationJobInput): Promise<NotificationJob> {
    const record = await this.prisma.notificationJob.create({
      data: {
        type: input.type,
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        callId: input.callId,
        title: input.title,
        body: input.body,
        dataJson: input.dataJson as Prisma.InputJsonValue | undefined,
        expiresAt: input.expiresAt,
        status: 'pending',
      },
    });

    return this.toDomain(record);
  }

  async markProcessing(id: string): Promise<NotificationJob> {
    const record = await this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'processing',
        attemptCount: {
          increment: 1,
        },
      },
    });

    return this.toDomain(record);
  }

  async markSent(id: string): Promise<NotificationJob> {
    const record = await this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      },
    });

    return this.toDomain(record);
  }

  async markFailed(
    id: string,
    error: string,
    nextAttemptAt?: Date,
  ): Promise<NotificationJob> {
    const record = await this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'failed',
        lastError: error,
        nextAttemptAt,
        sentAt: null,
      },
    });

    return this.toDomain(record);
  }

  async markSkipped(id: string, reason: string): Promise<NotificationJob> {
    const record = await this.prisma.notificationJob.update({
      where: { id },
      data: {
        status: 'skipped',
        lastError: reason,
        nextAttemptAt: null,
        sentAt: null,
      },
    });

    return this.toDomain(record);
  }

  async findRetryable(limit: number): Promise<NotificationJob[]> {
    const now = new Date();
    const records = await this.prisma.notificationJob.findMany({
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
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: PrismaNotificationJob): NotificationJob {
    return new NotificationJob({
      id: record.id,
      type: record.type as NotificationJobType,
      recipientUserId: record.recipientUserId,
      actorUserId: record.actorUserId,
      conversationId: record.conversationId,
      messageId: record.messageId,
      callId: record.callId,
      title: record.title,
      body: record.body,
      dataJson: record.dataJson,
      expiresAt: record.expiresAt,
      status: record.status as NotificationJobStatus,
      attemptCount: record.attemptCount,
      nextAttemptAt: record.nextAttemptAt,
    });
  }
}
