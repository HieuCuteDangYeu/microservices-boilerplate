import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { SearchTranscriptsUseCase } from '@content/application/use-cases/search-transcripts.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { Reel } from '@content/domain/entities/reel.entity';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import {
  ReelListQuery,
  ReelUpdateData,
} from '@content/domain/interfaces/content.repository.interface';
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
    private readonly listReelsUseCase: ListReelsUseCase,
    private readonly getReelUseCase: GetReelUseCase,
    private readonly updateReelUseCase: UpdateReelUseCase,
    private readonly deleteReelUseCase: DeleteReelUseCase,
    private readonly updateReelStatusUseCase: UpdateReelStatusUseCase,
    private readonly getReelStatusUseCase: GetReelStatusUseCase,
    private readonly searchTranscriptsUseCase: SearchTranscriptsUseCase,
  ) {}

  private toSerializable(reel: Reel): Record<string, unknown> {
    return {
      id: reel.id,
      userId: reel.userId,
      mediaKey: reel.mediaKey,
      title: reel.title,
      description: reel.description,
      tags: reel.tags,
      status: reel.status,
      visibility: reel.visibility,
      viewCount: Number(reel.viewCount),
      thumbnailKey: reel.thumbnailKey,
      transcript: reel.transcript,
      createdAt: reel.createdAt,
      updatedAt: reel.updatedAt,
    };
  }

  @MessagePattern('content.create_reel')
  async createReel(
    @Payload() data: { userId: string; payload: CreateReelDto },
  ) {
    try {
      const reel = await this.createReelUseCase.execute(
        data.userId,
        data.payload,
      );
      return this.toSerializable(reel);
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
      thumbnailKey?: string;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        data.transcript,
        data.embedding,
        data.thumbnailKey,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_completed] ${error.message} — rolling reel ${data.reelId} back to FAILED`,
      );
      try {
        await this.updateReelStatusUseCase.execute(data.reelId, 'FAILED');
      } catch (fallbackErr) {
        const fallbackError = fallbackErr as Error;
        console.error(
          `⚠️ [processing_completed] could not set FAILED either for reel ${data.reelId}: ${fallbackError.message}`,
        );
      }
    }
  }

  @EventPattern('reel.processing_failed')
  async handleProcessingFailed(
    @Payload() data: { reelId: string; status: 'FAILED' },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(data.reelId, data.status);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_failed] ${error.message} — reel ${data.reelId} NOT updated to FAILED`,
      );
    }
  }

  @EventPattern('reel.processing_started')
  async handleProcessingStarted(
    @Payload() data: { reelId: string; status: 'PROCESSING' },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(data.reelId, data.status);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_started] ${error.message} — reel ${data.reelId} NOT updated to PROCESSING`,
      );
    }
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

  @MessagePattern('content.list_reels')
  async listReels(
    @Payload()
    data: {
      userId?: string;
      visibility?: 'public' | 'private';
      limit?: number;
      cursor?: { createdAt: string; id: string };
    },
  ) {
    try {
      const query: ReelListQuery = {
        userId: data.userId,
        visibility: data.visibility,
        limit: data.limit ?? 20,
        cursor: data.cursor
          ? {
              createdAt: new Date(data.cursor.createdAt),
              id: data.cursor.id,
            }
          : undefined,
      };

      const result = await this.listReelsUseCase.execute(query);
      return {
        items: result.items.map((r) => this.toSerializable(r)),
        nextCursor: result.nextCursor
          ? `${result.nextCursor.createdAt.toISOString()}|${result.nextCursor.id}`
          : null,
      };
    } catch (error: unknown) {
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `List Reels Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.get_reel')
  async getReel(@Payload() data: { reelId: string }) {
    try {
      const reel = await this.getReelUseCase.execute(data.reelId);
      if (!reel) {
        throw new RpcException({
          statusCode: 404,
          message: 'Reel not found',
        });
      }
      return this.toSerializable(reel);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Get Reel Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.update_reel')
  async updateReel(
    @Payload()
    data: {
      reelId: string;
      userId: string;
      payload: Partial<ReelUpdateData>;
    },
  ) {
    try {
      const reel = await this.updateReelUseCase.execute(
        data.reelId,
        data.payload,
        data.userId,
      );
      if (!reel) {
        throw new RpcException({
          statusCode: reel === null ? 404 : 403,
          message:
            reel === null ? 'Reel not found' : 'Forbidden — not the owner',
        });
      }
      return this.toSerializable(reel);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Update Reel Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.delete_reel')
  async deleteReel(@Payload() data: { reelId: string; userId: string }) {
    try {
      const deleted = await this.deleteReelUseCase.execute(
        data.reelId,
        data.userId,
      );
      if (!deleted) {
        throw new RpcException({
          statusCode: 404,
          message: 'Reel not found or not owned by user',
        });
      }
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Delete Reel Error: ${err.message}`,
      });
    }
  }
}
