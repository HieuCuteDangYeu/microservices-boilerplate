import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { PushTokensService } from './push-tokens.service';

const registerPushTokenSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('fcm'),
    platform: z.enum(['ios', 'android']),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    appVersion: z.string().optional(),
    lifecycleVersion: z.number().int().min(1).max(2_147_483_647).optional(),
  }),
  z.object({
    provider: z.literal('apns_voip'),
    platform: z.literal('ios'),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    appVersion: z.string().optional(),
    lifecycleVersion: z.number().int().min(1).max(2_147_483_647).optional(),
    bundleId: z.string().min(1),
    deliveryEnvironment: z.enum(['development', 'production']),
  }),
]);

const deactivatePushTokenSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('fcm'),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    lifecycleVersion: z.number().int().min(1).max(2_147_483_647).optional(),
  }),
  z.object({
    provider: z.literal('apns_voip'),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    lifecycleVersion: z.number().int().min(1).max(2_147_483_647).optional(),
  }),
]);

@Controller('notifications/push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokensService: PushTokensService) {}

  @Post()
  register(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-notification-gateway-secret') gatewaySecret: string | undefined,
    @Body() body: unknown,
  ) {
    const authenticatedUserId = this.assertGatewayRequest(
      userId,
      gatewaySecret,
    );

    const parsed = registerPushTokenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    this.assertVersionedLifecycleHasDeviceId(parsed.data);

    return this.pushTokensService.register(authenticatedUserId, parsed.data);
  }

  @Post('deactivate')
  deactivate(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-notification-gateway-secret') gatewaySecret: string | undefined,
    @Body() body: unknown,
  ) {
    const authenticatedUserId = this.assertGatewayRequest(
      userId,
      gatewaySecret,
    );

    const parsed = deactivatePushTokenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    this.assertVersionedLifecycleHasDeviceId(parsed.data);

    return this.pushTokensService.deactivate(authenticatedUserId, parsed.data);
  }

  private assertGatewayRequest(
    userId: string | undefined,
    gatewaySecret: string | undefined,
  ): string {
    const expectedSecret = process.env.NOTIFICATION_GATEWAY_SECRET;

    if (!expectedSecret) {
      throw new InternalServerErrorException(
        'Missing NOTIFICATION_GATEWAY_SECRET',
      );
    }

    if (
      !userId ||
      !gatewaySecret ||
      !this.secretsMatch(gatewaySecret, expectedSecret)
    ) {
      throw new UnauthorizedException(
        'Invalid notification gateway credentials',
      );
    }

    return userId;
  }

  private assertVersionedLifecycleHasDeviceId(input: {
    deviceId?: string;
    lifecycleVersion?: number;
  }) {
    if (input.lifecycleVersion !== undefined && !input.deviceId) {
      throw new BadRequestException(
        'deviceId is required when lifecycleVersion is provided',
      );
    }
  }

  private secretsMatch(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
