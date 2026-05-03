import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { ListReelsQueryDto } from '@common/content/dtos/list-reels.dto';
import { UpdateReelDto } from '@common/content/dtos/update-reel.dto';
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

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContentController {
  private readonly cdnDomain: string;

  constructor(
    @Inject('CONTENT_SERVICE') private readonly contentClient: ClientProxy,
    private readonly configService: ConfigService,
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
  ) {
    if (
      query.visibility === 'private' &&
      query.userId !== request.user!.id &&
      !request.user!.roles?.includes('ADMIN')
    ) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const isPublicFeed =
      !query.userId || query.visibility !== 'private';
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

    return {
      items: result.items.map((r) => this._enrichReel(r)),
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

    return this._enrichReel(reel, { includeTranscript: true });
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

  private _enrichReel(reel: Reel, opts: { includeTranscript?: boolean } = {}) {
    const extIndex = reel.mediaKey.lastIndexOf('.');
    const folderPath =
      extIndex !== -1 ? reel.mediaKey.substring(0, extIndex) : reel.mediaKey;
    const streamUrl = `${this.cdnDomain}/${folderPath}/stream.m3u8`;
    const thumbnailUrl = reel.thumbnailKey
      ? `${this.cdnDomain}/${reel.thumbnailKey}`
      : undefined;

    const result: Record<string, unknown> = {
      id: reel.id,
      userId: reel.userId,
      mediaKey: reel.mediaKey,
      title: reel.title,
      tags: reel.tags,
      status: reel.status,
      visibility: reel.visibility,
      viewCount:
        typeof reel.viewCount === 'bigint'
          ? Number(reel.viewCount)
          : reel.viewCount,
      thumbnailKey: reel.thumbnailKey,
      thumbnailUrl,
      streamUrl,
      createdAt: reel.createdAt,
    };

    if (opts.includeTranscript) {
      result['description'] = reel.description;
      result['transcript'] = reel.transcript;
    }

    return result;
  }

  private handleMicroserviceError(error: any): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }
    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
