import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import { PushNotificationsService } from './push-notifications.service';

const newMessageNotificationSchema = z.object({
  recipientUserId: z.string().uuid(),
  actorUserId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

const incomingCallNotificationSchema = z.object({
  recipientUserId: z.string().uuid(),
  initiatorId: z.string().min(1),
  targetUserId: z.string().min(1),
  conversationId: z.string().min(1),
  callId: z.string().min(1),
  callType: z.enum(['VOICE', 'VIDEO']),
  initiatorDisplayName: z.string().min(1),
  initiatorAvatarUrl: z.string().min(1).optional(),
  ringTimeoutMs: z.number().int().positive(),
  expiresAt: z.string().datetime(),
});

const callStateUpdateSchema = z.object({
  recipientUserIds: z.array(z.string().uuid()).min(1),
  iosRecipientUserIds: z.array(z.string().uuid()).min(1).optional(),
  conversationId: z.string().min(1),
  callId: z.string().min(1),
  status: z.enum(['active', 'rejected', 'ended', 'cancelled']),
  reason: z.string().min(1).optional(),
  at: z.string().datetime(),
});

@Controller('notifications/internal')
export class InternalNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Post('new-message')
  async sendNewMessage(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertInternalSecret(internalSecret);

    const parsed = newMessageNotificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushNotificationsService.sendNewMessage(parsed.data);
  }

  @Post('incoming-call')
  async sendIncomingCall(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertInternalSecret(internalSecret);

    const parsed = incomingCallNotificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushNotificationsService.sendIncomingCall(parsed.data);
  }

  @Post('call-state-update')
  async sendCallStateUpdate(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertInternalSecret(internalSecret);

    const parsed = callStateUpdateSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushNotificationsService.sendCallStateUpdate(parsed.data);
  }

  private assertInternalSecret(internalSecret: string | undefined) {
    const expectedSecret = process.env.NOTIFICATION_INTERNAL_SECRET;

    if (!expectedSecret) {
      throw new InternalServerErrorException(
        'Missing NOTIFICATION_INTERNAL_SECRET',
      );
    }

    if (!internalSecret || internalSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid x-internal-secret');
    }
  }
}
