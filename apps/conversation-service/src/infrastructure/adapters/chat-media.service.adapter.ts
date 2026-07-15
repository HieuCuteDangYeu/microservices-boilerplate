import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { lastValueFrom, timeout } from 'rxjs';
import type { IChatMediaService } from '../../domain/interfaces/chat-media.service.interface';

@Injectable()
export class ChatMediaServiceAdapter implements IChatMediaService {
  private readonly logger = new Logger(ChatMediaServiceAdapter.name);

  constructor(
    @Inject('MEDIA_SERVICE_RMQ') private readonly client: ClientProxy,
  ) {}

  async deleteRecalledChatMedia(input: {
    userId: string;
    fileKeys: string[];
  }): Promise<void> {
    if (input.fileKeys.length === 0) {
      return;
    }

    try {
      await lastValueFrom(
        this.client
          .send<void>('media.delete_recalled_chat_media', input)
          .pipe(timeout(5000)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to delete recalled chat media for user ${input.userId}: ${message}`,
      );
      throw new Error('Could not delete recalled chat media');
    }
  }
}
