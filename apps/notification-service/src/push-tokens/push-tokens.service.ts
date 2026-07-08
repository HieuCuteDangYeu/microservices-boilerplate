import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';

import { PrismaService } from '../prisma/prisma.service';

export type PushProvider = 'fcm' | 'apns_voip';
export type PushPlatform = 'ios' | 'android';
export type PushDeliveryEnvironment = 'development' | 'production';

export type RegisterPushTokenInput =
  | {
      provider: 'fcm';
      platform: PushPlatform;
      token: string;
      deviceId?: string;
      appVersion?: string;
    }
  | {
      provider: 'apns_voip';
      platform: 'ios';
      token: string;
      deviceId?: string;
      appVersion?: string;
      bundleId: string;
      deliveryEnvironment: PushDeliveryEnvironment;
    };

export type DeactivatePushTokenInput = {
  provider: PushProvider;
  token: string;
};

export type ActivePushToken = Prisma.PushTokenGetPayload<{
  select: {
    id: true;
    userId: true;
    provider: true;
    platform: true;
    token: true;
    bundleId: true;
    deliveryEnvironment: true;
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
        bundleId: input.provider === 'apns_voip' ? input.bundleId : null,
        deliveryEnvironment:
          input.provider === 'apns_voip' ? input.deliveryEnvironment : null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        bundleId: input.provider === 'apns_voip' ? input.bundleId : null,
        deliveryEnvironment:
          input.provider === 'apns_voip' ? input.deliveryEnvironment : null,
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

  async findActiveByUserId(
    userId: string,
    filters?: {
      provider?: PushProvider;
      platform?: PushPlatform;
    },
  ): Promise<ActivePushToken[]> {
    return this.prisma.pushToken.findMany({
      where: {
        userId,
        ...(filters?.provider ? { provider: filters.provider } : {}),
        ...(filters?.platform ? { platform: filters.platform } : {}),
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        platform: true,
        token: true,
        bundleId: true,
        deliveryEnvironment: true,
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
