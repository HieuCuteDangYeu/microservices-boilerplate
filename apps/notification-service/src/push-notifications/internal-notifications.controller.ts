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
    const expectedSecret = process.env.NOTIFICATION_INTERNAL_SECRET;

    if (!expectedSecret) {
      throw new InternalServerErrorException(
        'Missing NOTIFICATION_INTERNAL_SECRET',
      );
    }

    if (!internalSecret || internalSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid x-internal-secret');
    }

    const parsed = newMessageNotificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.pushNotificationsService.sendNewMessage(parsed.data);
  }
}
