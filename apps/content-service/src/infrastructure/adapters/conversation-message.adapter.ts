import type { Reel } from '@content/domain/entities/reel.entity';
import type {
  CreatedConversationMessage,
  IConversationMessageService,
} from '@content/domain/interfaces/conversation-message.service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ConversationMessageAdapter implements IConversationMessageService {
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

  private buildStreamUrl(mediaKey: string): string {
    const extIndex = mediaKey.lastIndexOf('.');
    const folderPath =
      extIndex !== -1 ? mediaKey.substring(0, extIndex) : mediaKey;

    return `${this.cdnDomain}/${folderPath}/stream.m3u8`;
  }
}
