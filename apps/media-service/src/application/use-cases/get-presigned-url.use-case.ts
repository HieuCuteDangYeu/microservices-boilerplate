import { Injectable } from '@nestjs/common';
import { S3Service } from '../../infrastructure/services/s3.service';

@Injectable()
export class GetPresignedUrlUseCase {
  constructor(private readonly s3Service: S3Service) {}

  async execute(userId: string, fileName: string, fileType: string) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(fileType)) {
      throw new Error(
        'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
      );
    }

    const { uploadUrl, key } = await this.s3Service.generatePresignedUrl(
      userId,
      fileType,
    );

    return {
      uploadUrl,
      key,
      expiresIn: 300,
    };
  }
}
