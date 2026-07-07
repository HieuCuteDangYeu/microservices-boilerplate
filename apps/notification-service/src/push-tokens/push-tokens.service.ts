import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';

import { PrismaService } from '../prisma/prisma.service';

export type RegisterPushTokenInput = {
  provider: 'fcm';
  platform: 'ios' | 'android';
  token: string;
  deviceId?: string;
  appVersion?: string;
};

export type DeactivatePushTokenInput = {
  provider: 'fcm';
  token: string;
};

export type ActivePushToken = Prisma.PushTokenGetPayload<{
  select: {
    id: true;
    userId: true;
    provider: true;
    platform: true;
    token: true;
  };
}>;

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, input: RegisterPushTokenInput) {
    return this.prisma.pushToken.upsert({
      where: {
        provider_token: {
          provider: input.provider,
          token: input.token,
        },
      },
      create: {
        userId,
        provider: input.provider,
        platform: input.platform,
        token: input.token,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        isActive: true,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async deactivate(userId: string, input: DeactivatePushTokenInput) {
    return this.prisma.pushToken.updateMany({
      where: {
        userId,
        provider: input.provider,
        token: input.token,
        isActive: true,
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });
  }

  async findActiveByUserId(userId: string): Promise<ActivePushToken[]> {
    return this.prisma.pushToken.findMany({
      where: {
        userId,
        provider: 'fcm',
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        platform: true,
        token: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async deactivateById(id: string) {
    return this.prisma.pushToken.updateMany({
      where: {
        id,
        isActive: true,
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });
  }
}
