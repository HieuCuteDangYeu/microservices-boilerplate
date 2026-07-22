import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type {
  GenerateEmbeddingBatchRequest,
  GenerateEmbeddingBatchResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import type { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class AiServiceAdapter implements IIndexingAiService {
  constructor(@Inject('AI_SERVICE_RMQ') private readonly client: ClientProxy) {}

  async transcribeAudioKey(input: {
    audioKey: string;
    initialPrompt?: string;
  }): Promise<TranscriptionResult> {
    const response = await firstValueFrom(
      this.client
        .send<{
          transcript: string;
          transcription?: TranscriptionResult;
        }>('ai.transcribe_audio', input)
        .pipe(timeout(10 * 60_000)),
    );
    return response.transcription ?? { text: response.transcript };
  }

  async extractReelMetadata(input: {
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    maxTags?: number;
  }): Promise<ExtractedReelMetadata> {
    const response = await firstValueFrom(
      this.client
        .send<{
          metadata: ExtractedReelMetadata;
        }>('ai.extract_reel_metadata', input)
        .pipe(timeout(120_000)),
    );
    return response.metadata;
  }

  async generateEmbeddingBatch(
    input: GenerateEmbeddingBatchRequest,
  ): Promise<GenerateEmbeddingBatchResult> {
    return await firstValueFrom(
      this.client
        .send<GenerateEmbeddingBatchResult>(
          'ai.generate_embedding_batch',
          input,
        )
        .pipe(timeout(120_000)),
    );
  }
}
