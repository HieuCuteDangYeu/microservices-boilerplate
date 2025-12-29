import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Media } from '../../domain/entities/media.entity';
import type { IMediaRepository } from '../../domain/interfaces/media.repository.interface';
import type { IUserIntegrationService } from '../../domain/interfaces/user-integration.interface';

@Injectable()
export class SaveMediaUseCase {
  private readonly bucketName: string;
  private readonly region: string;

  constructor(
    @Inject('IMediaRepository')
    private readonly mediaRepository: IMediaRepository,
    @Inject('IUserIntegrationService')
    private readonly userIntegration: IUserIntegrationService,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.getOrThrow('AWS_BUCKET_NAME');
    this.region = this.configService.getOrThrow('AWS_REGION');
  }

  async execute(userId: string, key: string, mimeType: string): Promise<Media> {
    const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

    const newMedia = new Media(
      randomUUID(),
      userId,
      key,
      publicUrl,
      mimeType,
      new Date(),
    );

    const savedMedia = await this.mediaRepository.save(newMedia);

    this.userIntegration.notifyAvatarUpdated(userId, publicUrl);

    return savedMedia;
  }
}
