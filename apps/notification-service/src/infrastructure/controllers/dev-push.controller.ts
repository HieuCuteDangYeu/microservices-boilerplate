import {
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import { SendTestPushUseCase } from '../../application/use-cases/send-test-push.use-case';
import { ActiveFcmPushTokenNotFoundError } from '../../domain/errors/notification.errors';

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
  constructor(private readonly sendTestPush: SendTestPushUseCase) {}

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

    try {
      const result = await this.sendTestPush.execute(body);

      return {
        messageId: result.messageId,
        userId: result.pushToken.userId,
        platform: result.pushToken.platform,
        maskedToken: maskToken(result.pushToken.token),
      };
    } catch (error) {
      if (error instanceof ActiveFcmPushTokenNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}
