import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { ListReelsQueryDto } from '@common/content/dtos/list-reels.dto';
import { UpdateReelDto } from '@common/content/dtos/update-reel.dto';
import { ReelProcessingStatus } from '@common/content/interfaces/reel-processing-status.interface';
import {
  PaginatedReels,
  ReelDetail,
  ReelFeedListItem,
  ReelListItem,
} from '@common/content/interfaces/reel-response.interface';
import { Reel } from '@content/domain/entities/reel.entity';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '@gateway/auth/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom } from 'rxjs';
import { ReelAuthorService } from './reel-author.service';

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContentController {
  private readonly logger = new Logger(ContentController.name);
  private readonly cdnDomain: string;

  constructor(
    @Inject('CONTENT_SERVICE') private readonly contentClient: ClientProxy,
    private readonly configService: ConfigService,
    private readonly reelAuthorService: ReelAuthorService,
  ) {
    this.cdnDomain = this.configService
      .getOrThrow<string>('R2_PUBLIC_DOMAIN')
      .replace(/\/$/, '');
  }

  @Post('reels')
  @ApiOperation({ summary: 'Create a new reel from an uploaded S3 key' })
  async createReel(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateReelDto,
  ) {
    const reel = await lastValueFrom(
      this.contentClient
        .send<Reel>('content.create_reel', {
          userId: request.user!.id,
          payload: body,
        })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    return this._enrichReel(reel);
  }

  @Get('reels')
  @ApiOperation({ summary: 'List reels (public feed or user-specific)' })
  async listReels(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListReelsQueryDto,
  ): Promise<PaginatedReels<ReelFeedListItem>> {
    if (
      query.visibility === 'private' &&
      query.userId !== request.user!.id &&
      !request.user!.roles?.includes('ADMIN')
    ) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const isPublicFeed = !query.userId || query.visibility !== 'private';
    const effectiveVisibility = query.visibility ?? 'public';

    const result = await lastValueFrom(
      this.contentClient
        .send<{
          items: Reel[];
          nextCursor: string | null;
        }>('content.list_reels', {
          userId: query.userId,
          visibility: effectiveVisibility,
          limit: query.limit,
          cursor: query.cursor,
          // Exclude PENDING/PROCESSING/FAILED from public feed to prevent
          // broken streamUrl thumbnails that haven't been transcoded yet
          onlyPublished: isPublicFeed,
        })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    const authorsById = await this.reelAuthorService.loadAuthorMap(
      result.items.map((reel) => reel.userId),
    );

    return {
      items: result.items.map((reel) => ({
        ...this._enrichReel(reel),
        author: this.reelAuthorService.resolveAuthor(authorsById, reel.userId),
      })),
      nextCursor: result.nextCursor,
    };
  }

  @Get('reels/:id')
  @ApiOperation({ summary: 'Get a single reel by ID' })
  async getReel(
    @Req() request: AuthenticatedRequest,
    @Param('id') reelId: string,
  ) {
    const reel = await lastValueFrom(
      this.contentClient
        .send<Reel | null>('content.get_reel', { reelId })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    if (!reel) {
      throw new HttpException('Reel not found', HttpStatus.NOT_FOUND);
    }

    // Only owner can view private reels
    if (
      reel.visibility === 'private' &&
      reel.userId !== request.user!.id &&
      !request.user!.roles?.includes('ADMIN')
    ) {
      throw new HttpException('Reel not found', HttpStatus.NOT_FOUND);
    }

    // Increment view count only after visibility check passes
    await lastValueFrom(
      this.contentClient
        .send<{ success: boolean }>('content.increment_reel_view', { reelId })
        .pipe(catchError(() => [])),
    );

    return this._enrichReel(reel, { includeTranscript: true });
  }

  @Get('reels/:id/status')
  @ApiOperation({ summary: 'Get reel processing status' })
  async getReelStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') reelId: string,
  ) {
    const status = await lastValueFrom(
      this.contentClient
        .send<ReelProcessingStatus>('content.get_reel_status', { reelId })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    if (status.status === 'NOT_FOUND') {
      throw new HttpException('Reel not found', HttpStatus.NOT_FOUND);
    }

    if (
      status.visibility === 'private' &&
      status.userId !== request.user!.id &&
      !request.user!.roles?.includes('ADMIN')
    ) {
      throw new HttpException('Reel not found', HttpStatus.NOT_FOUND);
    }

    return {
      reelId: status.reelId,
      status: status.status,
      stage: status.stage,
      message: status.message,
      progress: status.progress,
      mediaKey: status.mediaKey,
      thumbnailKey: status.thumbnailKey,
      thumbnailUrl: status.thumbnailKey
        ? `${this.cdnDomain}/${status.thumbnailKey}`
        : undefined,
      streamUrl: status.mediaKey
        ? this.buildStreamUrl(status.mediaKey)
        : undefined,
    };
  }

  @Patch('reels/:id')
  @ApiOperation({ summary: 'Update reel metadata (owner only)' })
  async updateReel(
    @Req() request: AuthenticatedRequest,
    @Param('id') reelId: string,
    @Body() body: UpdateReelDto,
  ) {
    const reel = await lastValueFrom(
      this.contentClient
        .send<Reel | null>('content.update_reel', {
          reelId,
          userId: request.user!.id,
          payload: body,
        })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    if (!reel) {
      throw new HttpException(
        'Reel not found or not owned by you',
        HttpStatus.NOT_FOUND,
      );
    }

    return this._enrichReel(reel);
  }

  @Delete('reels/:id')
  @ApiOperation({ summary: 'Delete a reel (owner only)' })
  async deleteReel(
    @Req() request: AuthenticatedRequest,
    @Param('id') reelId: string,
  ) {
    await lastValueFrom(
      this.contentClient
        .send<{ success: boolean }>('content.delete_reel', {
          reelId,
          userId: request.user!.id,
        })
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );

    return { success: true };
  }

  private _enrichReel(
    reel: Reel,
    opts?: { includeTranscript?: false },
  ): ReelListItem;
  private _enrichReel(
    reel: Reel,
    opts: { includeTranscript: true },
  ): ReelDetail;
  private _enrichReel(
    reel: Reel,
    opts: { includeTranscript?: boolean } = {},
  ): ReelListItem | ReelDetail {
    const streamUrl = this.buildStreamUrl(reel.mediaKey);
    const thumbnailUrl = reel.thumbnailKey
      ? `${this.cdnDomain}/${reel.thumbnailKey}`
      : undefined;
    const createdAt =
      reel.createdAt instanceof Date
        ? reel.createdAt.toISOString()
        : new Date(reel.createdAt).toISOString();

    const result: ReelListItem = {
      id: reel.id,
      userId: reel.userId,
      mediaKey: reel.mediaKey,
      title: reel.title,
      description: reel.description,
      tags: reel.tags,
      status: reel.status,
      visibility: reel.visibility,
      viewCount:
        typeof reel.viewCount === 'bigint'
          ? Number(reel.viewCount)
          : reel.viewCount,
      thumbnailKey: reel.thumbnailKey,
      thumbnailUrl,
      processingStage: reel.processingStage,
      processingMessage: reel.processingMessage,
      processingProgress: reel.processingProgress,
      streamUrl,
      createdAt,
    };

    if (opts.includeTranscript) {
      return {
        ...result,
        transcript: reel.transcript,
        transcriptVtt: reel.transcriptVtt,
        transcriptSegments: reel.transcriptSegments,
      };
    }

    return result;
  }

  private buildStreamUrl(mediaKey: string): string {
    const extIndex = mediaKey.lastIndexOf('.');
    const folderPath =
      extIndex !== -1 ? mediaKey.substring(0, extIndex) : mediaKey;
    return `${this.cdnDomain}/${folderPath}/stream.m3u8`;
  }

  private handleMicroserviceError(error: any): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Content microservice request failed: ${message}`);
    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
