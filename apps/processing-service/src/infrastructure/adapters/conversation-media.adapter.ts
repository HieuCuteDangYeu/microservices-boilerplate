import type {
  CompletedVideoProcessingPayload,
  FailedVideoProcessingPayload,
} from '@common/media/dtos/video-processing-result.dto';
import type { IConversationMediaService } from '@processing/domain/interfaces/conversation-media.service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ConversationMediaAdapter implements IConversationMediaService {
  constructor(
    @Inject('CONVERSATION_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;

      if ('message' in record && typeof record['message'] === 'string') {
        return record['message'];
      }

      try {
        return JSON.stringify(error);
      } catch {
        return '[unserializable error object]';
      }
    }

    return String(error);
  }

  async emitMediaProcessingCompleted(
    payload: CompletedVideoProcessingPayload,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('media.video_processing_completed', payload),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit media.video_processing_completed: ${this.describeError(error)}`,
      );
    }
  }

  async emitMediaProcessingFailed(
    payload: FailedVideoProcessingPayload,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('media.video_processing_failed', payload),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit media.video_processing_failed: ${this.describeError(error)}`,
      );
    }
  }
}
