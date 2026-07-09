import {
  IContentService,
  PublicReelSearchInput,
  TranscriptMatch,
} from '@ai/domain/interfaces/content.service.interface';
import { AiRecommendedReel } from '@common/ai/dtos/ask-question-response.dto';
import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  private readonly logger = new Logger(ContentServiceAdapter.name);

  constructor(
    @Inject('CONTENT_RMQ') private readonly contentClient: ClientProxy,
  ) {}

  async searchReelContext(
    input: ReelContextSearchRequest,
  ): Promise<TranscriptMatch[]> {
    try {
      const results = await firstValueFrom(
        this.contentClient.send<TranscriptMatch[]>(
          'content.search_reel_context',
          input,
        ),
      );

      return Array.isArray(results) ? results : [];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `ContentServiceAdapter.searchReelContext failed: ${msg}. Returning empty context.`,
      );
      return [];
    }
  }

  async searchPublicReels(
    input: PublicReelSearchInput,
  ): Promise<AiRecommendedReel[]> {
    const query = input.query.trim();

    if (!query) {
      return [];
    }

    try {
      const results = await firstValueFrom(
        this.contentClient.send<AiRecommendedReel[]>('content.search_reels', {
          query,
          viewerId: input.viewerId,
          limit: input.limit,
        }),
      );

      return Array.isArray(results) ? results : [];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `ContentServiceAdapter.searchPublicReels failed: ${msg}. Returning empty reels.`,
      );

      return [];
    }
  }
}
