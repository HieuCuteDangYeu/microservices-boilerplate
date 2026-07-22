import type { ProcessVideoThumbnailPayload } from '@common/media/dtos/process-video-thumbnail.dto';
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProcessChatVideoUseCase } from '../../application/use-cases/process-chat-video.use-case';
import { ProcessReelUseCase } from '../../application/use-cases/process-reel.use-case';

@Controller()
export class ProcessingController {
  constructor(
    private readonly processReelUseCase: ProcessReelUseCase,
    private readonly processChatVideoUseCase: ProcessChatVideoUseCase,
  ) {}

  @EventPattern('reel.created')
  async handleReelCreated(
    @Payload()
    data: {
      reelId: string;
      mediaKey: string;
      userId: string;
      processingAttemptId?: string;
      queuedAt?: string;
      title?: string;
      description?: string;
      tags?: string[];
    },
  ) {
    await this.processReelUseCase.execute(data);
  }

  @EventPattern('media.process_video_thumbnail')
  async handleChatVideoProcessing(
    @Payload() data: ProcessVideoThumbnailPayload,
  ) {
    await this.processChatVideoUseCase.execute(data);
  }
}
