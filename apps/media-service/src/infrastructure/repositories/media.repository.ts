import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/media-client';
import { Media } from '../../domain/entities/media.entity';
import { IMediaRepository } from '../../domain/interfaces/media.repository.interface';

@Injectable()
export class MediaRepository
  extends PrismaClient
  implements OnModuleInit, IMediaRepository
{
  async onModuleInit() {
    await this.$connect();
  }

  async save(media: Media): Promise<Media> {
    const savedRecord = await this.media.create({
      data: {
        id: media.id,
        userId: media.userId,
        key: media.key,
        url: media.url,
        type: media.mimeType,
        createdAt: media.createdAt,
      },
    });

    return new Media(
      savedRecord.id,
      savedRecord.userId,
      savedRecord.key,
      savedRecord.url,
      savedRecord.type,
      savedRecord.createdAt,
    );
  }
}
