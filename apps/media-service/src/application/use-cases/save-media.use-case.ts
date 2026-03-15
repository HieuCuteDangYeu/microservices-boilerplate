import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Media } from '../../domain/entities/media.entity';
import type { IMediaRepository } from '../../domain/interfaces/media.repository.interface';
import type { IUserIntegrationService } from '../../domain/interfaces/user-integration.interface';

@Injectable()
export class SaveMediaUseCase {
  private readonly publicDomain: string;

  constructor(
    @Inject('IMediaRepository')
    private readonly mediaRepository: IMediaRepository,
    @Inject('IUserIntegrationService')
    private readonly userIntegration: IUserIntegrationService,
    private readonly configService: ConfigService,
  ) {
    this.publicDomain =
      this.configService.getOrThrow<string>('R2_PUBLIC_DOMAIN');
  }

  async execute(userId: string, key: string, mimeType: string): Promise<Media> {
    const baseUrl = this.publicDomain.replace(/\/$/, '');
    const publicUrl = `${baseUrl}/${key}`;

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
