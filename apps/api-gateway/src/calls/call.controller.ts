import type { AuthenticatedRequest } from '@gateway/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { lastValueFrom, timeout } from 'rxjs';

type CallStateLookupResponse =
  | {
      found: false;
      authorized: false;
    }
  | {
      found: true;
      authorized: false;
    }
  | {
      found: true;
      authorized: true;
      call: {
        callId: string;
        conversationId: string;
        initiatorId: string;
        targetUserId: string;
        recipientUserId: string;
        callType: 'VOICE' | 'VIDEO';
        status: string;
        initiatorDisplayName: string;
        initiatorAvatarUrl?: string;
        ringTimeoutMs: number;
        expiresAt: string;
      };
    };

@ApiTags('Calls')
@Controller('calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CallController {
  constructor(@Inject('CALL_SERVICE') private readonly callClient: ClientProxy) {}

  @Get(':callId/state')
  @ApiOperation({ summary: 'Get the current state for a call before joining' })
  async getCallState(
    @Param('callId') callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await lastValueFrom(
      this.callClient
        .send<CallStateLookupResponse>('call.get_state', {
          callId,
          userId: request.user!.id,
        })
        .pipe(timeout(5000)),
    );

    if (!result.found) {
      throw new NotFoundException('Call not found');
    }

    if (!result.authorized) {
      throw new ForbiddenException('You are not part of this call');
    }

    return result.call;
  }
}
