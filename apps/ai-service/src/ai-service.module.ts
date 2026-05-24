import { GenerateEmbeddingUseCase } from '@ai/application/use-cases/generate-embedding.use-case';
import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { TranscribeAudioBufferUseCase } from '@ai/application/use-cases/transcribe-audio-buffer.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { CloudflareTranscriptionAdapter } from '@ai/infrastructure/adapters/cloudflare-transcription.adapter';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { GeminiEmbeddingAdapter } from '@ai/infrastructure/adapters/gemini-embedding.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { R2AudioStorageService } from '@ai/infrastructure/services/r2-audio-storage.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: 'CONTENT_RMQ',
        useFactory: (config: ConfigService) => {
          const heartbeat = Number(
            config.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
          );

          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getOrThrow<string>('RABBITMQ_URL')],
              queue: 'content_queue',
              queueOptions: { durable: true },
              heartbeat:
                Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
              retryAttempts: 10,
              retryDelay: 3000,
            },
          };
        },
        inject: [ConfigService],
      },
      {
        name: 'CONVERSATION_RMQ',
        useFactory: (config: ConfigService) => {
          const heartbeat = Number(
            config.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
          );

          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getOrThrow<string>('RABBITMQ_URL')],
              queue: 'conversation_queue',
              queueOptions: { durable: true },
              heartbeat:
                Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
              retryAttempts: 10,
              retryDelay: 3000,
            },
          };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AiController],
  providers: [
    StreamChatUseCase,
    GenerateEmbeddingUseCase,
    TranscribeAudioUseCase,
    TranscribeAudioBufferUseCase,
    {
      provide: 'IEmbeddingService',
      useClass: GeminiEmbeddingAdapter,
    },
    {
      provide: 'ITranscriptionService',
      useClass: CloudflareTranscriptionAdapter,
    },
    {
      provide: 'IAudioStorageService',
      useClass: R2AudioStorageService,
    },
    {
      provide: 'ILlmService',
      useClass: GeminiLlmAdapter,
    },
    {
      provide: 'IContentService',
      useClass: ContentServiceAdapter,
    },
  ],
})
export class AiServiceModule {}
