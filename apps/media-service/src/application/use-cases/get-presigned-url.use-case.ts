import { Injectable } from '@nestjs/common';
import { S3Service } from '../../infrastructure/services/s3.service';

@Injectable()
export class GetPresignedUrlUseCase {
  constructor(private readonly s3Service: S3Service) {}

  async execute(userId: string, fileType: string) {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

    let folder = 'misc';
    if (allowedImageTypes.includes(fileType)) {
      folder = 'avatars';
    } else if (allowedVideoTypes.includes(fileType)) {
      folder = 'reels';
    } else {
      throw new Error(
        'Invalid file type. Only JPEG, PNG, WebP, MP4, WebM, and MOV are allowed.',
      );
    }

    const { uploadUrl, key } = await this.s3Service.generatePresignedUrl(
      userId,
      fileType,
      folder,
    );

    return {
      uploadUrl,
      key,
      expiresIn: 300,
    };
  }
}
