import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
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
  ) {}

  @MessagePattern('ai.generate_embedding')
  async handleGenerateEmbedding(@Payload() data: { text: string }) {
    try {
      const embedding = await this.generateEmbeddingUseCase.execute(data.text);
      return { embedding };
    } catch (error) {
      console.error(error);
      throw new RpcException({
        statusCode: 500,
        message: 'Internal server error processing embedding request',
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
    } catch (error) {
      console.error('Transcription error:', error);
      throw new RpcException({
        statusCode: 500,
        message: 'Internal server error processing transcription request',
      });
    }
  }
}
