import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import {
  CallSession,
  type CallType,
} from '../../domain/entities/call-session.entity';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import {
  ICallMediaEngine,
  type RouterRtpCapabilitiesResult,
} from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

interface ConversationDetailResponse {
  id?: string;
  participantIds?: string[];
  participants?: Array<{
    id?: string;
    userId?: string;
  }>;
  isGroup?: boolean;
}

export interface InitiateCallResult {
  role: 'host';
  session: CallSession;
  rtpCapabilities: RouterRtpCapabilitiesResult;
}

@Injectable()
export class InitiateCallUseCase {
  constructor(
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
    @Inject('ICallStateRepository')
    private readonly stateRepository: ICallStateRepository,
    @Inject('ICallEventPublisher')
    private readonly eventPublisher: ICallEventPublisher,
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
    @Inject('CONVERSATION_SERVICE_RMQ')
    private readonly conversationClient: ClientProxy,
  ) {}

  async execute(
    conversationId: string,
    initiatorId: string,
    targetUserId: string,
    callType: CallType,
    socketId: string,
  ): Promise<InitiateCallResult> {
    const now = new Date();
    const callId = randomUUID();
    const conversation = await this.getConversationOrThrow(
      conversationId,
      initiatorId,
    );
    const participantIds = this.extractParticipantIds(conversation);

    if (!participantIds.includes(initiatorId)) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    if (conversation.isGroup || participantIds.length !== 2) {
      throw new BadRequestException(
        'Call initiation is only supported for direct conversations',
      );
    }

    const resolvedTargetUserId = participantIds.find(
      (participantId) => participantId !== initiatorId,
    );

    if (!resolvedTargetUserId) {
      throw new BadRequestException(
        'Direct conversation peer could not be resolved',
      );
    }

    if (targetUserId !== resolvedTargetUserId) {
      throw new BadRequestException(
        'Target user does not match the direct conversation participant',
      );
    }

    await this.mediaEngine.createRoom(callId);

    const session = new CallSession({
      callId,
      conversationId,
      initiatorId,
      targetUserId: resolvedTargetUserId,
      callType,
      status: 'initiated',
      participantIds: [initiatorId],
      createdAt: now,
      updatedAt: now,
    });

    await this.sessionRepository.save(session);
    await this.stateRepository.upsertParticipant(
      new CallParticipant({
        userId: initiatorId,
        callId,
        role: 'host',
        socketId,
        isConnected: true,
        reconnectDeadlineAt: undefined,
        joinedAt: now,
      }),
    );

    await this.eventPublisher.publish('call.initiated', {
      callId,
      conversationId,
      initiatorId,
      targetUserId: resolvedTargetUserId,
      userId: initiatorId,
      callType,
      at: now.toISOString(),
    });

    return {
      role: 'host',
      session,
      rtpCapabilities: await this.mediaEngine.getRouterRtpCapabilities(callId),
    };
  }

  private async getConversationOrThrow(
    conversationId: string,
    initiatorId: string,
  ): Promise<ConversationDetailResponse> {
    try {
      const conversation = await lastValueFrom(
        this.conversationClient
          .send<ConversationDetailResponse>('get_conversation_detail', {
            id: conversationId,
            userId: initiatorId,
          })
          .pipe(timeout(5000)),
      );

      if (!conversation?.id) {
        throw new NotFoundException('Conversation not found');
      }

      return conversation;
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Conversation not found')) {
        throw new NotFoundException('Conversation not found');
      }

      if (message.includes('not a participant')) {
        throw new ForbiddenException(
          'You are not a participant of this conversation',
        );
      }

      throw error;
    }
  }

  private extractParticipantIds(
    conversation: ConversationDetailResponse,
  ): string[] {
    if (Array.isArray(conversation.participantIds)) {
      return conversation.participantIds.filter(
        (participantId): participantId is string =>
          typeof participantId === 'string' && participantId.length > 0,
      );
    }

    if (Array.isArray(conversation.participants)) {
      return conversation.participants
        .map((participant) => participant.id ?? participant.userId)
        .filter(
          (participantId): participantId is string =>
            typeof participantId === 'string' && participantId.length > 0,
        );
    }

    return [];
  }
}
