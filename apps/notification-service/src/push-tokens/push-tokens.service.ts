import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/notification-client';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

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
      lifecycleVersion?: number;
    }
  | {
      provider: 'apns_voip';
      platform: 'ios';
      token: string;
      deviceId?: string;
      appVersion?: string;
      lifecycleVersion?: number;
      bundleId: string;
      deliveryEnvironment: PushDeliveryEnvironment;
    };

export type DeactivatePushTokenInput = {
  provider: PushProvider;
  token: string;
  deviceId?: string;
  lifecycleVersion?: number;
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async register(userId: string, input: RegisterPushTokenInput) {
    if (
      input.lifecycleVersion !== undefined &&
      !(await this.advanceLifecycle(input, 'register'))
    ) {
      throw new ConflictException('Push token lifecycle has advanced');
    }

    const pushToken = await this.prisma.pushToken.upsert({
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

    if (
      input.lifecycleVersion !== undefined &&
      !(await this.isCurrentLifecycle(input, 'register'))
    ) {
      await this.prisma.pushToken.updateMany({
        where: {
          userId,
          provider: input.provider,
          token: input.token,
          deviceId: input.deviceId,
          isActive: true,
        },
        data: {
          isActive: false,
          lastSeenAt: new Date(),
        },
      });
      throw new ConflictException('Push token lifecycle has advanced');
    }

    return pushToken;
  }

  async deactivate(userId: string, input: DeactivatePushTokenInput) {
    if (
      input.lifecycleVersion !== undefined &&
      !(await this.advanceLifecycle(input, 'deactivate'))
    ) {
      return { count: 0 };
    }

    return this.prisma.pushToken.updateMany({
      where: {
        userId,
        provider: input.provider,
        token: input.token,
        ...(input.lifecycleVersion !== undefined
          ? {
              OR: [{ deviceId: input.deviceId }, { deviceId: null }],
            }
          : {}),
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

  private async advanceLifecycle(
    input: Pick<
      RegisterPushTokenInput,
      'provider' | 'token' | 'deviceId' | 'lifecycleVersion'
    >,
    action: 'register' | 'deactivate',
  ): Promise<boolean> {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return true;
    }

    const result = await this.redis.eval(
      `
        local current = redis.call('GET', KEYS[1])
        local candidateVersion = tonumber(ARGV[1])
        local candidateAction = ARGV[2]

        if not current then
          redis.call('SET', KEYS[1], ARGV[1] .. ':' .. candidateAction, 'EX', ARGV[3])
          return 1
        end

        local separator = string.find(current, ':')
        local currentVersion = tonumber(string.sub(current, 1, separator - 1))
        local currentAction = string.sub(current, separator + 1)

        if candidateVersion > currentVersion then
          redis.call('SET', KEYS[1], ARGV[1] .. ':' .. candidateAction, 'EX', ARGV[3])
          return 1
        end

        if candidateVersion == currentVersion and candidateAction == currentAction then
          redis.call('EXPIRE', KEYS[1], ARGV[3])
          return 1
        end

        return 0
      `,
      1,
      this.lifecycleKey(input),
      String(input.lifecycleVersion),
      action,
      String(15 * 60),
    );

    return result === 1;
  }

  private lifecycleKey(
    input: Pick<RegisterPushTokenInput, 'provider' | 'token' | 'deviceId'>,
  ) {
    const identity = `${input.provider}:${input.deviceId}:${input.token}`;
    const tokenHash = createHash('sha256').update(identity).digest('hex');

    return `notification:push-token-lifecycle:${tokenHash}`;
  }

  private async isCurrentLifecycle(
    input: Pick<
      RegisterPushTokenInput,
      'provider' | 'token' | 'deviceId' | 'lifecycleVersion'
    >,
    action: 'register' | 'deactivate',
  ) {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return true;
    }

    return (
      (await this.redis.get(this.lifecycleKey(input))) ===
      `${input.lifecycleVersion}:${action}`
    );
  }
}
