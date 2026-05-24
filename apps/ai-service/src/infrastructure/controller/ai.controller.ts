import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { TranscribeAudioBufferUseCase } from '@ai/application/use-cases/transcribe-audio-buffer.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { AskQuestionResponse } from '@common/ai/dtos/ask-question-response.dto';
import { AskQuestionPayload } from '@common/ai/dtos/ask-question.dto';
import type { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';
import { Controller, Inject } from '@nestjs/common';
import {
  ClientProxy,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { GenerateEmbeddingUseCase } from '../../application/use-cases/generate-embedding.use-case';

@Controller()
export class AiController {
  constructor(
    private readonly generateEmbeddingUseCase: GenerateEmbeddingUseCase,
    private readonly transcribeAudioUseCase: TranscribeAudioUseCase,
    private readonly transcribeAudioBufferUseCase: TranscribeAudioBufferUseCase,
    private readonly streamChatUseCase: StreamChatUseCase,
    @Inject('CONVERSATION_RMQ')
    private readonly conversationClient: ClientProxy,
  ) {}

  @MessagePattern('ai.generate_embedding')
  async handleGenerateEmbedding(@Payload() data: GenerateEmbeddingRequest) {
    if (!data || typeof data.text !== 'string' || data.text.trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid embedding request payload',
      });
    }

    try {
      const embedding = await this.generateEmbeddingUseCase.execute(data);
      return { embedding };
    } catch (err: unknown) {
      if (err instanceof RpcException) {
        throw err;
      }
      const error = err as Error;
      console.error(`[GenerateEmbedding] ${error.message}`);
      const statusCode = error.message.includes('not initialized') ? 503 : 500;
      throw new RpcException({
        statusCode,
        message: error.message,
      });
    }
  }

  @MessagePattern('ai.transcribe_audio_buffer')
  async handleTranscribeAudioBuffer(
    @Payload() payload: { audioBase64: string; initialPrompt?: string },
  ) {
    if (!payload || typeof payload.audioBase64 !== 'string') {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid audio buffer payload received from RabbitMQ',
      });
    }

    try {
      const transcription = await this.transcribeAudioBufferUseCase.execute(
        payload.audioBase64,
        { initialPrompt: payload.initialPrompt },
      );
      return {
        transcript: transcription.text,
        transcription,
      };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[TranscribeAudioBuffer] ${error.message}`);
      throw new RpcException({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  @MessagePattern('ai.transcribe_audio')
  async handleTranscribeAudio(
    @Payload() payload: { audioKey: string; initialPrompt?: string },
  ) {
    try {
      if (!payload || typeof payload.audioKey !== 'string') {
        throw new Error('Invalid audio key payload received from RabbitMQ');
      }

      const transcription = await this.transcribeAudioUseCase.execute(
        payload.audioKey,
        { initialPrompt: payload.initialPrompt },
      );
      return {
        transcript: transcription.text,
        transcription,
      };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[TranscribeAudio] ${error.message}`);
      throw new RpcException({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  @MessagePattern('ai.stream_question')
  async handleStreamQuestion(
    @Payload() data: AskQuestionPayload & { conversationId: string },
  ): Promise<AskQuestionResponse> {
    if (
      !data ||
      typeof data.message !== 'string' ||
      typeof data.userId !== 'string' ||
      typeof data.conversationId !== 'string'
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid stream payload structure',
      });
    }

    try {
      const answer: string = await this.streamChatUseCase.execute(
        data.message,
        data.userId,
        (token: string) => {
          try {
            this.conversationClient.emit('ai.stream_token', {
              conversationId: data.conversationId,
              userId: data.userId,
              token,
            });
          } catch {
            // Swallow: don't let emit failure kill the stream
          }
        },
      );

      if (!answer || answer.trim() === '') {
        return {
          error: {
            code: 'NO_CONTENT',
            message: 'No relevant video content found for this query.',
          },
        };
      }

      return { answer };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[StreamQuestion] ${error.message}`);
      throw new RpcException({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
