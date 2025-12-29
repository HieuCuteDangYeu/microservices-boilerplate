import { GetPresignedUrlDto } from '@common/media/dtos/get-presigned-url.dto';
import type { AuthenticatedRequest } from '@gateway/auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(
    @Inject('MEDIA_SERVICE') private readonly mediaClient: ClientProxy,
  ) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Get a pre-signed URL to upload an image' })
  @UseGuards(JwtAuthGuard)
  getUploadUrl(
    @Req() request: AuthenticatedRequest,
    @Body() body: GetPresignedUrlDto,
  ) {
    return this.mediaClient.send('media.get_presigned_url', {
      userId: request.user!.id,
      fileName: body.fileName,
      fileType: body.fileType,
    });
  }
}
