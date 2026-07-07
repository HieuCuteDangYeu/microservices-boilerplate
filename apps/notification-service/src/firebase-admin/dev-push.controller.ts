import {
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseAdminService } from './firebase-admin.service';

type SendTestPushBody = {
  title?: string;
  body?: string;
};

function maskToken(token: string) {
  if (token.length <= 16) return token;
  return `${token.slice(0, 16)}... (${token.length} chars)`;
}

@Controller('notifications/dev')
export class DevPushController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  @Post('send-test')
  async sendTest(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    @Body() body: SendTestPushBody,
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

    const pushToken = await this.prisma.pushToken.findFirst({
      where: {
        provider: 'fcm',
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!pushToken) {
      throw new NotFoundException('No active FCM token found');
    }

    const messageId = await this.firebaseAdmin.sendToToken({
      token: pushToken.token,
      title: body.title ?? 'Velora test notification',
      body: body.body ?? 'Backend Firebase Admin is working.',
      data: {
        type: 'DEV_TEST',
        source: 'notification-service',
      },
    });

    return {
      messageId,
      userId: pushToken.userId,
      platform: pushToken.platform,
      maskedToken: maskToken(pushToken.token),
    };
  }
}
