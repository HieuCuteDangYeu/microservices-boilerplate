import type { ProcessVideoThumbnailPayload } from '@common/media/dtos/process-video-thumbnail.dto';
import type { IVideoProcessingQueue } from '@media/domain/interfaces/video-processing-queue.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MediaProcessingAdapter implements IVideoProcessingQueue {
  constructor(
    @Inject('MEDIA_PROCESSING_RMQ') private readonly messageBroker: ClientProxy,
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

  async enqueueChatVideoProcessing(
    payload: ProcessVideoThumbnailPayload,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('media.process_video_thumbnail', payload),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to publish media.process_video_thumbnail: ${this.describeError(error)}`,
      );
    }
  }
}
