import { isRpcError } from '@common/constants/rpc-error.types';
import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { Reel } from '@content/domain/entities/reel.entity';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '@gateway/auth/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom } from 'rxjs';

@ApiTags('Content')
@Controller('content')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(
    @Inject('CONTENT_SERVICE') private readonly contentClient: ClientProxy,
  ) {}

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
        .pipe(
          catchError((error) => {
            return this.handleMicroserviceError(error);
          }),
        ),
    );

    const cdnDomain = process.env.R2_PUBLIC_DOMAIN;
    const folderPath = reel.mediaKey.replace('.mp4', '');
    const streamUrl = `${cdnDomain}/${folderPath}/stream.m3u8`;

    return {
      ...reel,
      streamUrl,
    };
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
