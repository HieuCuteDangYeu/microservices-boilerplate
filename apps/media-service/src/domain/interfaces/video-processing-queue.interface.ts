import type { ProcessVideoThumbnailPayload } from '@common/media/dtos/process-video-thumbnail.dto';

export abstract class IVideoProcessingQueue {
  abstract enqueueChatVideoProcessing(
    payload: ProcessVideoThumbnailPayload,
  ): Promise<void>;
}
