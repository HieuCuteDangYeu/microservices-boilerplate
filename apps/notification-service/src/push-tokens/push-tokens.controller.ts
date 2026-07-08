import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import { PushTokensService } from './push-tokens.service';

const registerPushTokenSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('fcm'),
    platform: z.enum(['ios', 'android']),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    appVersion: z.string().optional(),
  }),
  z.object({
    provider: z.literal('apns_voip'),
    platform: z.literal('ios'),
    token: z.string().min(10),
    deviceId: z.string().optional(),
    appVersion: z.string().optional(),
    bundleId: z.string().min(1),
    deliveryEnvironment: z.enum(['development', 'production']),
  }),
]);

const deactivatePushTokenSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('fcm'),
    token: z.string().min(10),
  }),
  z.object({
    provider: z.literal('apns_voip'),
    token: z.string().min(10),
  }),
]);

@Controller('notifications/push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokensService: PushTokensService) {}

  @Post()
  register(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!userId) {
      throw new UnauthorizedException(
        'Missing x-user-id. Replace with real auth guard in N6.',
      );
    }

    const parsed = registerPushTokenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushTokensService.register(userId, parsed.data);
  }

  @Post('deactivate')
  deactivate(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: unknown,
  ) {
    if (!userId) {
      throw new UnauthorizedException(
        'Missing x-user-id. Replace with real auth guard in N6.',
      );
    }

    const parsed = deactivatePushTokenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushTokensService.deactivate(userId, parsed.data);
  }
}
