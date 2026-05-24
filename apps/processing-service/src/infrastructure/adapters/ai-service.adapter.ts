import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';
import { isRpcError } from '@common/constants/rpc-error.types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom } from 'rxjs';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';

@Injectable()
export class AiServiceAdapter implements IAiService {
  private readonly logger = new Logger(AiServiceAdapter.name);

  constructor(
    @Inject('AI_SERVICE_RMQ') private readonly aiClient: ClientProxy,
  ) {}

  async generateEmbedding(input: GenerateEmbeddingRequest): Promise<number[]> {
    try {
      const response = await lastValueFrom(
        this.aiClient
          .send<{ embedding: number[] }>('ai.generate_embedding', input)
          .pipe(catchError((error) => this.handleMicroserviceError(error))),
      );
      return response.embedding;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to generate embedding via AI service: ${message}`,
      );
      throw error;
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const response = await lastValueFrom(
        this.aiClient
          .send<{ transcript: string }>('ai.transcribe_audio_buffer', {
            audioBase64: audioBuffer.toString('base64'),
          })
          .pipe(catchError((error) => this.handleMicroserviceError(error))),
      );
      return response.transcript;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to transcribe audio via AI service: ${message}`,
      );
      throw error;
    }
  }

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      const message = Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
      throw new Error(`AI service error [${error.statusCode}]: ${message}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AI service unreachable: ${message}`);
  }
}
