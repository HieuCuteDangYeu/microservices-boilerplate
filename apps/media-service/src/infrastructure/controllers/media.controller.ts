import { ConfirmUploadDto } from '@common/media/dtos/confirm-upload.dto';
import { GetPresignedUrlDto } from '@common/media/dtos/get-presigned-url.dto';
import { SaveMediaUseCase } from '@media/application/use-cases/save-media.use-case';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GetPresignedUrlUseCase } from '../../application/use-cases/get-presigned-url.use-case';

@Controller()
export class MediaController {
  constructor(
    private readonly getPresignedUrlUseCase: GetPresignedUrlUseCase,
    private readonly saveMediaUseCase: SaveMediaUseCase,
  ) {}

  @MessagePattern('media.get_presigned_url')
  async handleGetPresignedUrl(
    @Payload() data: GetPresignedUrlDto & { userId: string },
  ) {
    try {
      return await this.getPresignedUrlUseCase.execute(
        data.userId,
        data.fileName,
        data.fileType,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Invalid file type')
      ) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message:
          error instanceof Error ? error.message : 'Internal Server Error',
      });
    }
  }

  @MessagePattern('media.confirm_upload')
  async handleConfirmUpload(
    @Payload() data: ConfirmUploadDto & { userId: string },
  ) {
    try {
      return await this.saveMediaUseCase.execute(
        data.userId,
        data.key,
        data.mimeType,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcException({
          statusCode: 400,
          message: error.message,
        });
      }

      throw new RpcException({
        statusCode: 500,
        message: 'Failed to confirm upload',
      });
    }
  }
}
