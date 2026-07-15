import { ForbiddenException, Injectable } from '@nestjs/common';
import { S3Service } from '../../infrastructure/services/s3.service';

const CHAT_MEDIA_FOLDERS = [
  'chat-images',
  'chat-videos',
  'chat-thumbnails',
] as const;

@Injectable()
export class DeleteRecalledChatMediaUseCase {
  constructor(private readonly s3Service: S3Service) {}

  async execute(input: { userId: string; fileKeys: string[] }): Promise<void> {
    const fileKeys = [
      ...new Set(
        input.fileKeys
          .filter((key): key is string => typeof key === 'string')
          .map((key) => key.replace(/^\/+/, '').trim())
          .filter(Boolean),
      ),
    ];

    if (fileKeys.length === 0) {
      return;
    }

    const ownedPrefixes = CHAT_MEDIA_FOLDERS.map(
      (folder) => `${folder}/${input.userId}/`,
    );
    const hasUnownedKey = fileKeys.some(
      (key) => !ownedPrefixes.some((prefix) => key.startsWith(prefix)),
    );

    if (hasUnownedKey) {
      throw new ForbiddenException('You are not allowed to delete this media');
    }

    await this.s3Service.deleteObjects(fileKeys);
  }
}
