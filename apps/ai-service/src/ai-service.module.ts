import { GenerateEmbeddingUseCase } from '@ai/application/use-cases/generate-embedding.use-case';
import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { XenovaEmbeddingAdapter } from '@ai/infrastructure/adapters/xenova-embedding.adapter';
import { XenovaTranscriptionAdapter } from '@ai/infrastructure/adapters/xenova-transcription.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: 'CONTENT_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'content_queue',
            queueOptions: { durable: true },
            heartbeat: 60,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'CONVERSATION_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'conversation_queue',
            queueOptions: { durable: true },
            heartbeat: 60,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AiController],
  providers: [
    StreamChatUseCase,
    GenerateEmbeddingUseCase,
    TranscribeAudioUseCase,
    {
      provide: 'IEmbeddingService',
      useClass: XenovaEmbeddingAdapter,
    },
    {
      provide: 'ITranscriptionService',
      useClass: XenovaTranscriptionAdapter,
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
