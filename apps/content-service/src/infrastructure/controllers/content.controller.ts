import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { SearchTranscriptsUseCase } from '@content/application/use-cases/search-transcripts.use-case';
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
    private readonly getReelStatusUseCase: GetReelStatusUseCase,
    private readonly searchTranscriptsUseCase: SearchTranscriptsUseCase,
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
    @Payload()
    data: {
      reelId: string;
      status: 'COMPLETED';
      transcript?: string;
      embedding?: number[];
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        data.transcript,
        data.embedding,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_completed] ${error.message} — reel ${data.reelId} NOT updated to COMPLETED`,
      );
    }
  }

  @EventPattern('reel.processing_failed')
  async handleProcessingFailed(
    @Payload() data: { reelId: string; status: 'FAILED' },
  ) {
    await this.updateReelStatusUseCase.execute(data.reelId, data.status);
  }

  @MessagePattern('content.get_reel_status')
  async getReelStatus(@Payload() data: { reelId: string }) {
    try {
      return await this.getReelStatusUseCase.execute(data.reelId);
    } catch {
      throw new RpcException({
        statusCode: 404,
        message: 'Reel not found',
      });
    }
  }

  @MessagePattern('content.search_transcripts')
  async handleSearchTranscripts(@Payload() payload: { queryVector: number[] }) {
    if (!payload || !Array.isArray(payload.queryVector)) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid array format for queryVector payload',
      });
    }

    try {
      const results = await this.searchTranscriptsUseCase.execute(
        payload.queryVector,
      );
      return results;
    } catch (error: unknown) {
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Transcript Search Error: ${err.message}`,
      });
    }
  }
}
