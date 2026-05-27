import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetProfileReelContextUseCase } from '@content/application/use-cases/get-profile-reel-context.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { IncrementReelViewUseCase } from '@content/application/use-cases/increment-reel-view.use-case';
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
    private readonly getProfileReelContextUseCase: GetProfileReelContextUseCase,
    private readonly incrementReelViewUseCase: IncrementReelViewUseCase,
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
      processingStage: reel.processingStage,
      processingMessage: reel.processingMessage,
      processingProgress: reel.processingProgress,
      transcript: reel.transcript,
      transcriptVtt: reel.transcriptVtt,
      transcriptSegments: reel.transcriptSegments,
      createdAt: reel.createdAt,
      updatedAt: reel.updatedAt,
    };
  }

  private serializeCursor(
    cursor: {
      createdAt: Date;
      id: string;
    } | null,
  ): string | null {
    return cursor ? `${cursor.createdAt.toISOString()}|${cursor.id}` : null;
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
      transcriptVtt?: string;
      transcriptSegments?: TranscriptSegment[];
      embedding?: number[];
      chunks?: ReelChunkIndexInput[];
      thumbnailKey?: string;
      stage?: string;
      message?: string;
      progress?: number;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        data.transcript,
        data.transcriptVtt,
        data.transcriptSegments,
        data.embedding,
        data.thumbnailKey,
        data.stage,
        data.message,
        data.progress,
        data.chunks,
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
    @Payload()
    data: {
      reelId: string;
      status: 'FAILED';
      stage?: string;
      message?: string;
      progress?: number;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        data.stage,
        data.message,
        data.progress,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_failed] ${error.message} — reel ${data.reelId} NOT updated to FAILED`,
      );
    }
  }

  @EventPattern('reel.processing_started')
  async handleProcessingStarted(
    @Payload()
    data: {
      reelId: string;
      status: 'PROCESSING';
      stage?: string;
      message?: string;
      progress?: number;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        data.stage,
        data.message,
        data.progress,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_started] ${error.message} — reel ${data.reelId} NOT updated to PROCESSING`,
      );
    }
  }

  @EventPattern('reel.processing_progress')
  async handleProcessingProgress(
    @Payload()
    data: {
      reelId: string;
      status: 'PROCESSING';
      stage?: string;
      message?: string;
      progress?: number;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        data.stage,
        data.message,
        data.progress,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `❌ [processing_progress] ${error.message} — reel ${data.reelId} progress NOT updated`,
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

  @MessagePattern('content.search_reel_context')
  async handleSearchTranscripts(
    @Payload() payload: { queryVector: number[]; userId: string },
  ) {
    if (
      !payload ||
      !Array.isArray(payload.queryVector) ||
      typeof payload.userId !== 'string'
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel context search',
      });
    }

    try {
      const results = await this.searchTranscriptsUseCase.execute(
        payload.queryVector,
        payload.userId,
      );
      return results;
    } catch (error: unknown) {
      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Reel Context Search Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.get_profile_reel_context')
  async getProfileReelContext(
    @Payload()
    data: {
      reelId: string;
      before?: number;
      after?: number;
    },
  ) {
    if (
      !data ||
      typeof data.reelId !== 'string' ||
      (data.before !== undefined &&
        (!Number.isInteger(data.before) || data.before < 0)) ||
      (data.after !== undefined &&
        (!Number.isInteger(data.after) || data.after < 0))
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for profile reel context',
      });
    }

    try {
      const context = await this.getProfileReelContextUseCase.execute(
        data.reelId,
        data.before ?? 1,
        data.after ?? 5,
      );

      if (!context) {
        throw new RpcException({
          statusCode: 404,
          message: 'Reel not found',
        });
      }

      return {
        source: 'profile' as const,
        scope: {
          userId: context.anchorUserId,
          visibility: context.anchorVisibility,
        },
        selectedId: context.selectedId,
        selectedIndex: context.selectedIndex,
        items: context.items.map((item) => this.toSerializable(item)),
        previousCursor: this.serializeCursor(context.previousCursor),
        nextCursor: this.serializeCursor(context.nextCursor),
      };
    } catch (error: unknown) {
      if (error instanceof RpcException) {
        throw error;
      }

      const err = error as Error;
      throw new RpcException({
        statusCode: 500,
        message: `Get Profile Reel Context Error: ${err.message}`,
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
      onlyPublished?: boolean;
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
        onlyPublished: data.onlyPublished,
      };

      const result = await this.listReelsUseCase.execute(query);
      return {
        items: result.items.map((r) => this.toSerializable(r)),
        nextCursor: this.serializeCursor(result.nextCursor),
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

  @MessagePattern('content.increment_reel_view')
  async incrementReelView(@Payload() data: { reelId: string }) {
    await this.incrementReelViewUseCase.execute(data.reelId);
    return { success: true };
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
