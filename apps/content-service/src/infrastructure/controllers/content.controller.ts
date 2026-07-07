import { TrackReelEventsUseCase } from '@ai/application/use-cases/track-reel-events.use-case';
import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { BackfillReelChunksUseCase } from '@content/application/use-cases/backfill-reel-chunks.use-case';
import { ClaimReelProcessingAttemptUseCase } from '@content/application/use-cases/claim-reel-processing-attempt.use-case';
import { CreateReelShareLinkUseCase } from '@content/application/use-cases/create-reel-share-link.use-case';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetProfileReelContextUseCase } from '@content/application/use-cases/get-profile-reel-context.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { IncrementReelViewUseCase } from '@content/application/use-cases/increment-reel-view.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { ReprocessReelUseCase } from '@content/application/use-cases/reprocess-reel.use-case';
import { ResolveReelShareLinkUseCase } from '@content/application/use-cases/resolve-reel-share-link.use-case';
import { RevokeReelShareLinkUseCase } from '@content/application/use-cases/revoke-reel-share-link.use-case';
import { ShareReelUseCase } from '@content/application/use-cases/share-reel.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { ReelShareLink } from '@content/domain/entities/reel-share-link.entity';
import { Reel } from '@content/domain/entities/reel.entity';
import {
  InvalidMediaFileError,
  ReelAlreadyProcessingError,
  ReelNotFoundError,
  ReelReprocessForbiddenError,
} from '@content/domain/errors/content.error';
import {
  ReelListQuery,
  ReelProcessingMediaMetadata,
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
import { SearchReelContextUseCase } from './../../application/use-cases/search-reel-context.use-case';

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
    private readonly searchReelContextUseCase: SearchReelContextUseCase,
    private readonly shareReelUseCase: ShareReelUseCase,
    private readonly createReelShareLinkUseCase: CreateReelShareLinkUseCase,
    private readonly resolveReelShareLinkUseCase: ResolveReelShareLinkUseCase,
    private readonly revokeReelShareLinkUseCase: RevokeReelShareLinkUseCase,
    private readonly backfillReelChunksUseCase: BackfillReelChunksUseCase,
    private readonly trackReelEventsUseCase: TrackReelEventsUseCase,
    private readonly reprocessReelUseCase: ReprocessReelUseCase,
    private readonly claimReelProcessingAttemptUseCase: ClaimReelProcessingAttemptUseCase,
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
      processingAttemptId: reel.processingAttemptId,
      processingStartedAt: reel.processingStartedAt,
      processingFailedAt: reel.processingFailedAt,
      processingCompletedAt: reel.processingCompletedAt,
      processingErrorCode: reel.processingErrorCode,
      sourceDurationMs: reel.sourceDurationMs,
      sourceWidth: reel.sourceWidth,
      sourceHeight: reel.sourceHeight,
      sourceFps: reel.sourceFps,
      sourceBitrateKbps: reel.sourceBitrateKbps,
      sourceHasAudio: reel.sourceHasAudio,
      sourceRotation: reel.sourceRotation,
      encodedVariantCount: reel.encodedVariantCount,
      encodedMaxHeight: reel.encodedMaxHeight,
      encodedFps: reel.encodedFps,
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

  private serializeShareLink(link: ReelShareLink) {
    return {
      id: link.id,
      reelId: link.reelId,
      ownerId: link.ownerId,
      token: link.token,
      createdBy: link.createdBy,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      revokedAt: link.revokedAt?.toISOString() ?? null,
      clickCount: Number(link.clickCount),
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    };
  }

  private toExternalShareReelSerializable(reel: Reel): Record<string, unknown> {
    return {
      id: reel.id,
      userId: reel.userId,
      mediaKey: reel.mediaKey,
      title: reel.title,
      description: reel.description,
      tags: reel.tags,
      status: reel.status,
      visibility: reel.visibility,
      thumbnailKey: reel.thumbnailKey,
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
      processingAttemptId?: string;
      title?: string;
      description?: string;
      tags?: string[];
      transcript?: string;
      transcriptVtt?: string;
      transcriptSegments?: TranscriptSegment[];
      chunks?: ReelChunkIndexInput[];
      thumbnailKey?: string;
      stage?: string;
      message?: string;
      progress?: number;
      mediaMetadata?: ReelProcessingMediaMetadata;
    },
  ) {
    try {
      await this.updateReelStatusUseCase.execute(
        data.reelId,
        data.status,
        data.transcript,
        data.transcriptVtt,
        data.transcriptSegments,
        data.thumbnailKey,
        data.stage,
        data.message,
        data.progress,
        data.chunks,
        data.title,
        data.description,
        data.tags,
        data.processingAttemptId,
        undefined,
        undefined,
        data.mediaMetadata,
      );
    } catch (err: unknown) {
      const error = err as Error;

      console.error(
        `[processing_completed] ${error.message} — rolling reel ${data.reelId} back to FAILED`,
      );

      try {
        await this.updateReelStatusUseCase.execute(
          data.reelId,
          'FAILED',
          undefined,
          undefined,
          undefined,
          undefined,
          'FAILED',
          'Video processing failed',
          data.progress,
          undefined,
          undefined,
          undefined,
          undefined,
          data.processingAttemptId,
          'PROCESSING_COMPLETED_HANDLER_FAILED',
          error.message,
        );
      } catch (fallbackErr: unknown) {
        const fallbackError = fallbackErr as Error;

        console.error(
          `[processing_completed] could not set FAILED either for reel ${data.reelId}: ${fallbackError.message}`,
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
      processingAttemptId?: string;
      errorCode?: string;
      errorDetail?: string;
      mediaMetadata?: ReelProcessingMediaMetadata;
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
        data.stage,
        data.message,
        data.progress,
        undefined,
        undefined,
        undefined,
        undefined,
        data.processingAttemptId,
        data.errorCode,
        data.errorDetail,
        data.mediaMetadata,
      );
    } catch (err: unknown) {
      const error = err as Error;

      console.error(
        `[processing_failed] ${error.message} — reel ${data.reelId} NOT updated to FAILED`,
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
      processingAttemptId?: string;
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
        data.stage,
        data.message,
        data.progress,
        undefined,
        undefined,
        undefined,
        undefined,
        data.processingAttemptId,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[processing_started] ${error.message} — reel ${data.reelId} NOT updated to PROCESSING`,
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
      processingAttemptId?: string;
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
        data.stage,
        data.message,
        data.progress,
        undefined,
        undefined,
        undefined,
        undefined,
        data.processingAttemptId,
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[processing_progress] ${error.message} — reel ${data.reelId} progress NOT updated`,
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

  @MessagePattern('content.claim_reel_processing_attempt')
  async claimReelProcessingAttempt(
    @Payload()
    data: {
      reelId: string;
      processingAttemptId: string;
    },
  ) {
    if (
      !data ||
      typeof data.reelId !== 'string' ||
      data.reelId.trim().length === 0 ||
      typeof data.processingAttemptId !== 'string' ||
      data.processingAttemptId.trim().length === 0
    ) {
      return false;
    }

    return await this.claimReelProcessingAttemptUseCase.execute({
      reelId: data.reelId,
      processingAttemptId: data.processingAttemptId,
    });
  }

  @MessagePattern('content.reprocess_reel')
  async reprocessReel(
    @Payload()
    data: {
      reelId: string;
      userId: string;
      isAdmin?: boolean;
    },
  ) {
    if (
      !data ||
      typeof data.reelId !== 'string' ||
      data.reelId.trim().length === 0 ||
      typeof data.userId !== 'string' ||
      data.userId.trim().length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel reprocessing',
      });
    }

    try {
      const reel = await this.reprocessReelUseCase.execute(
        data.reelId.trim(),
        data.userId.trim(),
        data.isAdmin === true,
      );

      return this.toSerializable(reel);
    } catch (error: unknown) {
      if (error instanceof ReelNotFoundError) {
        throw new RpcException({
          statusCode: 404,
          message: error.message,
        });
      }

      if (error instanceof ReelReprocessForbiddenError) {
        throw new RpcException({
          statusCode: 403,
          message: error.message,
        });
      }

      if (error instanceof ReelAlreadyProcessingError) {
        throw new RpcException({
          statusCode: 409,
          message: error.message,
        });
      }

      if (error instanceof InvalidMediaFileError) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }

      const err = error as Error;

      throw new RpcException({
        statusCode: 500,
        message: `Reprocess Reel Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.search_reel_context')
  async handleSearchReelContext(@Payload() payload: ReelContextSearchRequest) {
    const expectedVectorLength = 384;
    const hasValidVector =
      Array.isArray(payload?.queryVector) &&
      payload.queryVector.length === expectedVectorLength &&
      payload.queryVector.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      );

    if (
      !payload ||
      !hasValidVector ||
      typeof payload.queryText !== 'string' ||
      payload.queryText.trim().length === 0 ||
      typeof payload.userId !== 'string' ||
      payload.userId.trim().length === 0 ||
      (payload.sharedOnly === true &&
        (typeof payload.conversationId !== 'string' ||
          payload.conversationId.trim().length === 0)) ||
      (payload.limit !== undefined &&
        (!Number.isInteger(payload.limit) ||
          payload.limit < 1 ||
          payload.limit > 20))
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel context search',
      });
    }

    try {
      const results = await this.searchReelContextUseCase.execute(payload);
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

  @MessagePattern('content.share_reel')
  async shareReel(
    @Payload()
    payload: {
      reelId: string;
      sharedByUserId: string;
      conversationId: string;
      sharedWithUserId?: string;
    },
  ) {
    if (
      !payload ||
      typeof payload.reelId !== 'string' ||
      payload.reelId.trim().length === 0 ||
      typeof payload.sharedByUserId !== 'string' ||
      payload.sharedByUserId.trim().length === 0 ||
      typeof payload.conversationId !== 'string' ||
      payload.conversationId.trim().length === 0 ||
      (payload.sharedWithUserId !== undefined &&
        (typeof payload.sharedWithUserId !== 'string' ||
          payload.sharedWithUserId.trim().length === 0))
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel sharing',
      });
    }

    try {
      return await this.shareReelUseCase.execute({
        reelId: payload.reelId.trim(),
        sharedByUserId: payload.sharedByUserId.trim(),
        conversationId: payload.conversationId.trim(),
        sharedWithUserId: payload.sharedWithUserId?.trim(),
      });
    } catch (error: unknown) {
      const err = error as Error;

      if (err.name === 'ReelNotFoundError') {
        throw new RpcException({
          statusCode: 404,
          message: err.message,
        });
      }

      if (err.name === 'ReelNotReadyError') {
        throw new RpcException({
          statusCode: 409,
          message: err.message,
        });
      }

      if (err.name === 'ReelShareForbiddenError') {
        throw new RpcException({
          statusCode: 403,
          message: err.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: `Reel Share Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.create_reel_share_link')
  async createReelShareLink(
    @Payload()
    payload: {
      reelId: string;
      createdBy: string;
      expiresInDays?: number;
      reuseExisting?: boolean;
    },
  ) {
    if (
      !payload ||
      typeof payload.reelId !== 'string' ||
      payload.reelId.trim().length === 0 ||
      typeof payload.createdBy !== 'string' ||
      payload.createdBy.trim().length === 0 ||
      (payload.expiresInDays !== undefined &&
        (!Number.isInteger(payload.expiresInDays) ||
          payload.expiresInDays < 1 ||
          payload.expiresInDays > 365))
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel share link creation',
      });
    }

    try {
      const link = await this.createReelShareLinkUseCase.execute({
        reelId: payload.reelId.trim(),
        createdBy: payload.createdBy.trim(),
        expiresInDays: payload.expiresInDays,
        reuseExisting: payload.reuseExisting,
      });

      return this.serializeShareLink(link);
    } catch (error: unknown) {
      const err = error as Error;

      if (err.name === 'ReelNotFoundError') {
        throw new RpcException({
          statusCode: 404,
          message: err.message,
        });
      }

      if (err.name === 'ReelNotReadyError') {
        throw new RpcException({
          statusCode: 409,
          message: err.message,
        });
      }

      if (err.name === 'ReelShareForbiddenError') {
        throw new RpcException({
          statusCode: 403,
          message: err.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: `Create Reel Share Link Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.resolve_reel_share_link')
  async resolveReelShareLink(@Payload() payload: { token: string }) {
    if (
      !payload ||
      typeof payload.token !== 'string' ||
      payload.token.trim().length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel share link resolution',
      });
    }

    try {
      const result = await this.resolveReelShareLinkUseCase.execute({
        token: payload.token.trim(),
      });

      return {
        link: this.serializeShareLink(result.link),
        reel: this.toExternalShareReelSerializable(result.reel),
      };
    } catch (error: unknown) {
      const err = error as Error;

      if (err.name === 'ReelShareLinkNotFoundError') {
        throw new RpcException({
          statusCode: 404,
          message: err.message,
        });
      }

      if (
        err.name === 'ReelShareLinkExpiredError' ||
        err.name === 'ReelShareLinkRevokedError'
      ) {
        throw new RpcException({
          statusCode: 410,
          message: err.message,
        });
      }

      if (err.name === 'ReelNotReadyError') {
        throw new RpcException({
          statusCode: 409,
          message: err.message,
        });
      }

      if (err.name === 'ReelShareForbiddenError') {
        throw new RpcException({
          statusCode: 403,
          message: err.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: `Resolve Reel Share Link Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.revoke_reel_share_link')
  async revokeReelShareLink(
    @Payload()
    payload: {
      token: string;
      revokedByUserId: string;
    },
  ) {
    if (
      !payload ||
      typeof payload.token !== 'string' ||
      payload.token.trim().length === 0 ||
      typeof payload.revokedByUserId !== 'string' ||
      payload.revokedByUserId.trim().length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel share link revocation',
      });
    }

    try {
      const link = await this.revokeReelShareLinkUseCase.execute({
        token: payload.token.trim(),
        revokedByUserId: payload.revokedByUserId.trim(),
      });

      return this.serializeShareLink(link);
    } catch (error: unknown) {
      const err = error as Error;

      if (err.name === 'ReelShareLinkNotFoundError') {
        throw new RpcException({
          statusCode: 404,
          message: err.message,
        });
      }

      if (err.name === 'ReelShareForbiddenError') {
        throw new RpcException({
          statusCode: 403,
          message: err.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: `Revoke Reel Share Link Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.backfill_reel_chunks')
  async handleBackfillReelChunks(
    @Payload()
    payload?: {
      limit?: number;
      batchSize?: number;
      maxReels?: number;
      reelId?: string;
      dryRun?: boolean;
    },
  ) {
    try {
      const limit = this.normalizeBackfillNumber(payload?.limit, 20, 1, 100);

      const batchSize = this.normalizeBackfillNumber(
        payload?.batchSize,
        limit,
        1,
        100,
      );

      const reelId =
        typeof payload?.reelId === 'string' && payload.reelId.trim().length > 0
          ? payload.reelId.trim()
          : undefined;

      const maxReels = reelId
        ? 1
        : this.normalizeBackfillNumber(payload?.maxReels, limit, 1, 500);

      const dryRun = payload?.dryRun === true;

      return await this.backfillReelChunksUseCase.execute({
        batchSize,
        maxReels,
        reelId,
        dryRun,
      });
    } catch (error: unknown) {
      const err = error as Error;

      throw new RpcException({
        statusCode: 500,
        message: `Backfill Reel Chunks Error: ${err.message}`,
      });
    }
  }

  @MessagePattern('content.track_reel_events')
  async trackReelEvents(
    @Payload()
    data: {
      userId: string;
      events: Array<{
        reelId: string;
        sessionId?: string;
        eventType:
          | 'IMPRESSION'
          | 'WATCH_START'
          | 'WATCH_PROGRESS'
          | 'WATCH_END'
          | 'SKIP'
          | 'COMPLETE'
          | 'REPLAY'
          | 'PAUSE'
          | 'RESUME'
          | 'MUTE'
          | 'UNMUTE';
        watchMs?: number;
        durationMs?: number;
        percentageWatched?: number;
        muted?: boolean;
        completed?: boolean;
        replayed?: boolean;
        skipped?: boolean;
      }>;
    },
  ) {
    if (
      !data ||
      typeof data.userId !== 'string' ||
      data.userId.trim().length === 0 ||
      !Array.isArray(data.events) ||
      data.events.length === 0 ||
      data.events.length > 50
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid payload for reel event tracking',
      });
    }

    await this.trackReelEventsUseCase.execute(data.userId, data.events);

    return { success: true };
  }

  private normalizeBackfillNumber(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (value === undefined || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(value), min), max);
  }
}
