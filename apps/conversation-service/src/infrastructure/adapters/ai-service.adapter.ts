import { AskQuestionResponse } from '@common/ai/dtos/ask-question-response.dto';
import { isRpcError } from '@common/constants/rpc-error.types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom } from 'rxjs';
import {
  AskQuestionResult,
  IAiService,
} from '../../domain/interfaces/ai-service.interface';

@Injectable()
export class AiServiceAdapter implements IAiService {
  private readonly logger = new Logger(AiServiceAdapter.name);

  constructor(
    @Inject('AI_SERVICE_RMQ') private readonly aiClient: ClientProxy,
  ) {}

  async askQuestionStream(
    message: string,
    userId: string,
    conversationId: string,
  ): Promise<AskQuestionResult> {
    const payload = { message, userId, conversationId };

    try {
      const response = await lastValueFrom(
        this.aiClient
          .send<AskQuestionResponse>('ai.stream_question', payload)
          .pipe(
            catchError((error) => {
              this.handleMicroserviceError(error);
            }),
          ),
      );

      if (response.error) {
        return { answer: null, error: response.error };
      }

      return { answer: response.answer ?? null };
    } catch (error: unknown) {
      if (isRpcError(error)) {
        return {
          answer: null,
          error: {
            code: 'AI_UNAVAILABLE' as const,
            message: Array.isArray(error.message)
              ? error.message.join(', ')
              : error.message,
          },
        };
      }

      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to reach AI service for streaming: ${msg}`);
      return {
        answer: null,
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'AI service is temporarily unavailable',
        },
      };
    }
  }

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      const message = Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
      throw new Error(`AI service error [${error.statusCode}]: ${message}`);
    }

    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`AI service unreachable: ${msg}`);
  }
}
