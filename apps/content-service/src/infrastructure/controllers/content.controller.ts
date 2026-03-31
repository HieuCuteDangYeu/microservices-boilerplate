import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import { Controller } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { CreateReelUseCase } from '../../application/use-cases/create-reel.use-case';

@Controller()
export class ContentController {
  constructor(
    private readonly createReelUseCase: CreateReelUseCase,
    private readonly updateReelStatusUseCase: UpdateReelStatusUseCase,
  ) {}

  @MessagePattern('content.create_reel')
  async createReel(
    @Payload() data: { userId: string; payload: CreateReelDto },
  ) {
    try {
      return await this.createReelUseCase.execute(data.userId, data.payload);
    } catch (error) {
      if (error instanceof InvalidMediaFileError) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
          error: 'Bad Request',
        });
      }

      throw new RpcException({
        statusCode: 500,
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while creating the reel',
        error: 'Internal Server Error',
      });
    }
  }

  @EventPattern('reel.processing_completed')
  async handleProcessingCompleted(
    @Payload() data: { reelId: string; status: 'COMPLETED' },
  ) {
    await this.updateReelStatusUseCase.execute(data.reelId, data.status);
  }

  @EventPattern('reel.processing_failed')
  async handleProcessingFailed(
    @Payload() data: { reelId: string; status: 'FAILED' },
  ) {
    await this.updateReelStatusUseCase.execute(data.reelId, data.status);
  }
}
