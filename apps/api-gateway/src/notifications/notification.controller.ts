import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '@gateway/auth/guards/jwt-auth.guard';

type RegisterPushTokenResponse = {
  id: string;
  userId: string;
  provider: string;
  platform: string;
  token: string;
  deviceId?: string | null;
  appVersion?: string | null;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

type DeactivatePushTokenResponse = {
  count: number;
};

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly notificationServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.notificationServiceUrl = (
      this.configService.get<string>('NOTIFICATION_SERVICE_URL') ||
      'http://localhost:3015'
    ).replace(/\/$/, '');
  }

  @Post('push-tokens')
  @ApiOperation({ summary: 'Register or refresh the current user push token' })
  async registerPushToken(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<RegisterPushTokenResponse> {
    return this.forwardToNotificationService<RegisterPushTokenResponse>({
      path: '/notifications/push-tokens',
      userId: request.user!.id,
      body,
    });
  }

  @Post('push-tokens/deactivate')
  @ApiOperation({ summary: 'Deactivate the current user push token' })
  async deactivatePushToken(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<DeactivatePushTokenResponse> {
    return this.forwardToNotificationService<DeactivatePushTokenResponse>({
      path: '/notifications/push-tokens/deactivate',
      userId: request.user!.id,
      body,
    });
  }

  private async forwardToNotificationService<TResponse>({
    path,
    userId,
    body,
  }: {
    path: string;
    userId: string;
    body: unknown;
  }): Promise<TResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.notificationServiceUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new HttpException(
        `Notification service unavailable: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const responseBody = await this.readResponseBody(response);

    if (!response.ok) {
      throw new HttpException(responseBody, response.status);
    }

    return responseBody as TResponse;
  }

  private async readResponseBody(
    response: Response,
  ): Promise<string | Record<string, any>> {
    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return response.text();
    }

    const data: unknown = await response.json();

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, any>;
    }

    return {
      message: data,
    };
  }
}
