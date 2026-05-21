import { Injectable } from '@nestjs/common';
import { S3Service } from '../../infrastructure/services/s3.service';

@Injectable()
export class GetPresignedUrlUseCase {
  constructor(private readonly s3Service: S3Service) {}

  async execute(
    userId: string,
    fileType: string,
    purpose: 'avatar' | 'chat' | 'reel' | 'chat_thumbnail',
  ) {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

    let folder = 'misc';

    if (purpose === 'avatar') {
      if (!allowedImageTypes.includes(fileType)) {
        throw new Error(
          'Invalid file type. Avatars must be JPEG, PNG, or WebP.',
        );
      }

      folder = 'avatars';
    } else if (purpose === 'reel') {
      if (!allowedVideoTypes.includes(fileType)) {
        throw new Error('Invalid file type. Reels must be MP4, WebM, or MOV.');
      }

      folder = 'reels';
    } else if (purpose === 'chat') {
      if (allowedImageTypes.includes(fileType)) {
        folder = 'chat-images';
      } else if (allowedVideoTypes.includes(fileType)) {
        folder = 'chat-videos';
      } else {
        throw new Error(
          'Invalid file type. Only JPEG, PNG, WebP, MP4, WebM, and MOV are allowed.',
        );
      }
    } else if (purpose === 'chat_thumbnail') {
      if (!allowedImageTypes.includes(fileType)) {
        throw new Error(
          'Invalid file type. Chat thumbnails must be JPEG, PNG, or WebP.',
        );
      }

      folder = 'chat-thumbnails';
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
