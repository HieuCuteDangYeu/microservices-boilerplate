import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { IContentService } from '../../domain/interfaces/content.service.interface';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  constructor(
    @Inject('CONTENT_SERVICE') private readonly contentClient: ClientProxy,
  ) {}

  async getReelStatus(
    reelId: string,
  ): Promise<{ status: string; mediaKey?: string }> {
    return await lastValueFrom(
      this.contentClient.send<{ status: string; mediaKey?: string }>(
        'content.get_reel_status',
        { reelId },
      ),
    ).catch(() => ({ status: 'NOT_FOUND' }));
  }
}
