import {
  IContentService,
  TranscriptMatch,
} from '@ai/domain/interfaces/content.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  private readonly logger = new Logger(ContentServiceAdapter.name);

  constructor(
    @Inject('CONTENT_RMQ') private readonly contentClient: ClientProxy,
  ) {}

  async searchTranscripts(queryVector: number[]): Promise<TranscriptMatch[]> {
    try {
      const results = await firstValueFrom(
        this.contentClient.send<TranscriptMatch[]>(
          'content.search_transcripts',
          { queryVector },
        ),
      );

      if (!results || !Array.isArray(results)) {
        return [];
      }

      return results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `ContentServiceAdapter.searchTranscripts failed: ${msg}. Returning empty context.`,
      );
      return [];
    }
  }
}
