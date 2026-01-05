import { isRpcError } from '@common/constants/rpc-error.types';
import { ConfirmUploadDto } from '@common/media/dtos/confirm-upload.dto';
import { GetPresignedUrlDto } from '@common/media/dtos/get-presigned-url.dto';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '@gateway/auth/guards/jwt-auth.guard';
import { Media } from '@media/domain/entities/media.entity';
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

@ApiTags('Media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(
    @Inject('MEDIA_SERVICE') private readonly mediaClient: ClientProxy,
  ) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Get a pre-signed URL to upload an image' })
  async getUploadUrl(
    @Req() request: AuthenticatedRequest,
    @Body() body: GetPresignedUrlDto,
  ) {
    return await lastValueFrom(
      this.mediaClient
        .send<{
          uploadUrl: string;
          key: string;
          expiresIn: number;
        }>('media.get_presigned_url', {
          userId: request.user!.id,
          fileName: body.fileName,
          fileType: body.fileType,
        })
        .pipe(
          catchError((error) => {
            this.handleMicroserviceError(error);
          }),
        ),
    );
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm upload and update user avatar' })
  async confirmUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: ConfirmUploadDto,
  ) {
    return await lastValueFrom(
      this.mediaClient
        .send<Media>('media.confirm_upload', {
          userId: request.user!.id,
          key: body.key,
          mimeType: body.mimeType,
        })
        .pipe(
          catchError((error) => {
            this.handleMicroserviceError(error);
          }),
        ),
    );
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
