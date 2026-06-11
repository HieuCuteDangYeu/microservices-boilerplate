import { BOT_USER_ID } from '@common/constants/seed.constants';
import type { Reel } from '@content/domain/entities/reel.entity';
import type {
  CreatedConversationMessage,
  IConversationMessageService,
} from '@content/domain/interfaces/conversation-message.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

interface ConversationDetailResponse {
  id?: string;
  participantIds?: string[];
  participants?: Array<{
    id?: string;
    userId?: string;
  }>;
}

@Injectable()
export class ConversationMessageAdapter implements IConversationMessageService {
  private readonly logger = new Logger(ConversationMessageAdapter.name);
  private readonly cdnDomain: string;

  constructor(
    @Inject('CONVERSATION_SERVICE_RMQ')
    private readonly conversationClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {
    this.cdnDomain = this.configService
      .getOrThrow<string>('R2_PUBLIC_DOMAIN')
      .replace(/\/$/, '');
  }

  async isBotConversation(input: {
    conversationId: string;
    userId: string;
  }): Promise<boolean> {
    try {
      const conversation = await firstValueFrom(
        this.conversationClient.send<ConversationDetailResponse>(
          'get_conversation_detail',
          {
            id: input.conversationId,
            userId: input.userId,
          },
        ),
      );

      const participantIds = this.extractParticipantIds(conversation);

      return participantIds.includes(BOT_USER_ID);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[ReelShare] Bot conversation check failed conversation=${input.conversationId}: ${message}`,
      );

      return false;
    }
  }

  async createReelMessage(input: {
    conversationId: string;
    senderId: string;
    reel: Reel;
  }): Promise<CreatedConversationMessage> {
    const response = await firstValueFrom(
      this.conversationClient.send<{
        message: CreatedConversationMessage;
      }>('create_message', {
        conversationId: input.conversationId,
        senderId: input.senderId,
        type: 'reel',
        signalType: 0,
        content: input.reel.title?.trim() || 'Shared a reel',
        media: {
          fileKey: input.reel.mediaKey,
          fileUrl: this.buildStreamUrl(input.reel.mediaKey),
          thumbnailKey: input.reel.thumbnailKey,
          thumbnailUrl: input.reel.thumbnailKey
            ? `${this.cdnDomain}/${input.reel.thumbnailKey}`
            : undefined,
          mimeType: 'application/vnd.velora.reel',
          status: 'ready',
          reelId: input.reel.id,
          reelOwnerId: input.reel.userId,
          reelTitle: input.reel.title,
          reelDescription: input.reel.description,
        },
      }),
    );

    return response.message;
  }

  private extractParticipantIds(
    conversation: ConversationDetailResponse | null | undefined,
  ): string[] {
    if (!conversation) {
      return [];
    }

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

  private buildStreamUrl(mediaKey: string): string {
    const extIndex = mediaKey.lastIndexOf('.');
    const folderPath =
      extIndex !== -1 ? mediaKey.substring(0, extIndex) : mediaKey;

    return `${this.cdnDomain}/${folderPath}/stream.m3u8`;
  }
}
