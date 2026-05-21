import type { ProcessVideoThumbnailPayload } from '@common/media/dtos/process-video-thumbnail.dto';
import type { IVideoProcessingQueue } from '@media/domain/interfaces/video-processing-queue.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../../infrastructure/services/s3.service';

interface FinalizedChatMedia {
  fileKey: string;
  fileUrl: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  status: 'ready' | 'processing' | 'failed';
  failureReason?: string;
}

@Injectable()
export class FinalizeChatUploadUseCase {
  private readonly logger = new Logger(FinalizeChatUploadUseCase.name);

  constructor(
    private readonly s3Service: S3Service,
    @Inject('IVideoProcessingQueue')
    private readonly videoProcessingQueue: IVideoProcessingQueue,
  ) {}

  async execute(
    userId: string,
    key: string,
    fileType: string,
    thumbnailKey?: string,
  ): Promise<FinalizedChatMedia> {
    const normalizedKey = this.normalizeKey(key);
    this.assertUserOwnsKey(userId, normalizedKey);
    const normalizedThumbnailKey = thumbnailKey
      ? this.normalizeKey(thumbnailKey)
      : undefined;

    if (normalizedThumbnailKey) {
      this.assertUserOwnsKey(userId, normalizedThumbnailKey);
    }

    const finalizedMedia: FinalizedChatMedia = {
      fileKey: normalizedKey,
      fileUrl: this.s3Service.getPublicUrl(normalizedKey),
      ...(normalizedThumbnailKey
        ? {
            thumbnailKey: normalizedThumbnailKey,
            thumbnailUrl: this.s3Service.getPublicUrl(normalizedThumbnailKey),
          }
        : {}),
      mimeType: fileType,
      status: fileType.startsWith('video/') ? 'processing' : 'ready',
    };

    if (!fileType.startsWith('video/')) {
      return finalizedMedia;
    }

    const jobPayload: ProcessVideoThumbnailPayload = {
      userId,
      fileKey: normalizedKey,
      ...(normalizedThumbnailKey
        ? { thumbnailKey: normalizedThumbnailKey }
        : {}),
      fileType,
      attempt: 0,
      maxAttempts: 3,
    };

    try {
      await this.videoProcessingQueue.enqueueChatVideoProcessing(jobPayload);
      return finalizedMedia;
    } catch (error) {
      this.logger.error(
        `Failed to enqueue video processing job for ${normalizedKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private assertUserOwnsKey(userId: string, key: string) {
    const ownershipPrefix = `/${userId}/`;

    if (!key.includes(ownershipPrefix)) {
      throw new Error('You are not allowed to finalize this upload.');
    }
  }

  private normalizeKey(key: string) {
    return key.replace(/^\/+/, '');
  }
}
