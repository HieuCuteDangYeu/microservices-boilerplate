import {
  GenerateEmbeddingRequest,
  GenerateEmbeddingResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import { isRpcError } from '@common/constants/rpc-error.types';
import { IAiEmbeddingService } from '@content/application/use-cases/ai-embedding.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom } from 'rxjs';

@Injectable()
export class AiEmbeddingServiceAdapter implements IAiEmbeddingService {
  private readonly logger = new Logger(AiEmbeddingServiceAdapter.name);

  constructor(
    @Inject('AI_SERVICE_RMQ')
    private readonly aiClient: ClientProxy,
  ) {}

  async generateEmbedding(
    input: GenerateEmbeddingRequest,
  ): Promise<GenerateEmbeddingResult> {
    try {
      const response = await lastValueFrom(
        this.aiClient
          .send<{
            embedding: GenerateEmbeddingResult;
          }>('ai.generate_embedding', input)
          .pipe(catchError((error) => this.handleMicroserviceError(error))),
      );

      return response.embedding;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to generate embedding through AI service: ${message}`,
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
