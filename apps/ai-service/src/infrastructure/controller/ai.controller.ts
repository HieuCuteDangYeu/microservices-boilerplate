import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { AskQuestionResponse } from '@common/ai/dtos/ask-question-response.dto';
import { AskQuestionPayload } from '@common/ai/dtos/ask-question.dto';
import { Controller, Inject } from '@nestjs/common';
import {
  ClientProxy,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { GenerateEmbeddingUseCase } from '../../application/use-cases/generate-embedding.use-case';

interface SerializedBuffer {
  type: 'Buffer';
  data: number[];
}

@Controller()
export class AiController {
  constructor(
    private readonly generateEmbeddingUseCase: GenerateEmbeddingUseCase,
    private readonly transcribeAudioUseCase: TranscribeAudioUseCase,
    private readonly streamChatUseCase: StreamChatUseCase,
    @Inject('CONVERSATION_RMQ')
    private readonly conversationClient: ClientProxy,
  ) {}

  @MessagePattern('ai.generate_embedding')
  async handleGenerateEmbedding(@Payload() data: { text: string }) {
    try {
      const embedding = await this.generateEmbeddingUseCase.execute(data.text);
      return { embedding };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[GenerateEmbedding] ${error.message}`);
      const statusCode = error.message.includes('not initialized') ? 503 : 500;
      throw new RpcException({
        statusCode,
        message: error.message,
      });
    }
  }

  @MessagePattern('ai.transcribe_audio')
  async handleTranscribeAudio(
    @Payload() payload: { audioBuffer: Buffer | SerializedBuffer },
  ) {
    try {
      let buffer: Buffer;

      if (Buffer.isBuffer(payload.audioBuffer)) {
        buffer = payload.audioBuffer;
      } else if (
        payload.audioBuffer &&
        'data' in payload.audioBuffer &&
        Array.isArray(payload.audioBuffer.data)
      ) {
        buffer = Buffer.from(payload.audioBuffer.data);
      } else {
        throw new Error(
          'Unrecognized audio buffer format received from RabbitMQ',
        );
      }

      const transcript = await this.transcribeAudioUseCase.execute(buffer);
      return { transcript };
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
