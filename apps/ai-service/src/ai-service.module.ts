import { BuildChatPromptUseCase } from '@ai/application/use-cases/build-chat-prompt.use-case';
import { ExtractUserMemoriesFromTurnUseCase } from '@ai/application/use-cases/extract-user-memories-from-turn.use-case';
import { GenerateEmbeddingUseCase } from '@ai/application/use-cases/generate-embedding.use-case';
import { GetConversationMemoryUseCase } from '@ai/application/use-cases/get-conversation-memory.use-case';
import { GetRelevantUserMemoriesUseCase } from '@ai/application/use-cases/get-relevant-user-memories.use-case';
import { HandleConversationTurnCompletedUseCase } from '@ai/application/use-cases/handle-conversation-turn-completed.use-case';
import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { TranscribeAudioBufferUseCase } from '@ai/application/use-cases/transcribe-audio-buffer.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { UpdateConversationMemoryUseCase } from '@ai/application/use-cases/update-conversation-memory.use-case';
import { UpsertUserMemoriesUseCase } from '@ai/application/use-cases/upsert-user-memories.use-case';
import { CloudflareTranscriptionAdapter } from '@ai/infrastructure/adapters/cloudflare-transcription.adapter';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { ConversationTokenPublisherAdapter } from '@ai/infrastructure/adapters/conversation-token-publisher.adapter';
import { GeminiConversationSummarizerAdapter } from '@ai/infrastructure/adapters/gemini-conversation-summarizer.adapter';
import { GeminiEmbeddingAdapter } from '@ai/infrastructure/adapters/gemini-embedding.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { GeminiMemoryExtractorAdapter } from '@ai/infrastructure/adapters/gemini-memory-extractor.adapter';
import { SimpleRerankerAdapter } from '@ai/infrastructure/adapters/simple-reranker.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { PrismaService } from '@ai/infrastructure/prisma/prisma.service';
import { PrismaConversationMemoryRepository } from '@ai/infrastructure/repositories/prisma-conversation-memory.repository';
import { PrismaUserMemoryRepository } from '@ai/infrastructure/repositories/prisma-user-memory.repository';
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
    PrismaService,
    StreamChatUseCase,
    GenerateEmbeddingUseCase,
    TranscribeAudioUseCase,
    TranscribeAudioBufferUseCase,
    BuildChatPromptUseCase,
    GetRelevantUserMemoriesUseCase,
    ExtractUserMemoriesFromTurnUseCase,
    UpsertUserMemoriesUseCase,
    HandleConversationTurnCompletedUseCase,
    GetConversationMemoryUseCase,
    UpdateConversationMemoryUseCase,
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
    {
      provide: 'IRerankerService',
      useClass: SimpleRerankerAdapter,
    },
    {
      provide: 'IChatTokenPublisher',
      useClass: ConversationTokenPublisherAdapter,
    },
    {
      provide: 'IUserMemoryRepository',
      useClass: PrismaUserMemoryRepository,
    },
    {
      provide: 'IMemoryExtractorService',
      useClass: GeminiMemoryExtractorAdapter,
    },
    {
      provide: 'IConversationMemoryRepository',
      useClass: PrismaConversationMemoryRepository,
    },
    {
      provide: 'IConversationSummarizerService',
      useClass: GeminiConversationSummarizerAdapter,
    },
  ],
})
export class AiServiceModule {}
