import { GetPresignedUrlDto } from '@common/media/dtos/get-presigned-url.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GetPresignedUrlUseCase } from '../../application/use-cases/get-presigned-url.use-case';

@Controller()
export class MediaController {
  constructor(
    private readonly getPresignedUrlUseCase: GetPresignedUrlUseCase,
  ) {}

  @MessagePattern('media.get_presigned_url')
  async handleGetPresignedUrl(
    @Payload() data: GetPresignedUrlDto & { userId: string },
  ) {
    try {
      return await this.getPresignedUrlUseCase.execute(
        data.userId,
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
}
