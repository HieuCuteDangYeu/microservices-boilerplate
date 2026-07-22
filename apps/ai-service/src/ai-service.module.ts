import { BackfillUserMemoryEmbeddingsUseCase } from '@ai/application/use-cases/backfill-user-memory-embeddings.use-case';
import { BuildRagCitationsUseCase } from '@ai/application/use-cases/build-rag-citations.use-case';
import { CheckContextSufficiencyUseCase } from '@ai/application/use-cases/check-context-sufficiency.use-case';
import { CreateNoContextAnswerUseCase } from '@ai/application/use-cases/create-no-context-answer.use-case';
import { ExtractReelMetadataUseCase } from '@ai/application/use-cases/extract-reel-metadata.use-case';
import { ExtractUserMemoriesFromTurnUseCase } from '@ai/application/use-cases/extract-user-memories-from-turn.use-case';
import { GenerateDraftAnswerUseCase } from '@ai/application/use-cases/generate-draft-answer.use-case';
import { GenerateEmbeddingUseCase } from '@ai/application/use-cases/generate-embedding.use-case';
import { GenerateEmbeddingBatchUseCase } from '@ai/application/use-cases/generate-embedding-batch.use-case';
import { GetConversationMemoryUseCase } from '@ai/application/use-cases/get-conversation-memory.use-case';
import { GetRelevantUserMemoriesUseCase } from '@ai/application/use-cases/get-relevant-user-memories.use-case';
import { HandleConversationTurnCompletedUseCase } from '@ai/application/use-cases/handle-conversation-turn-completed.use-case';
import { MemoryAgentUseCase } from '@ai/application/use-cases/memory-agent.use-case';
import { MemoryWriterAgentUseCase } from '@ai/application/use-cases/memory-writer-agent.use-case';
import { QueryRouterAgentUseCase } from '@ai/application/use-cases/query-router-agent.use-case';
import { RetrievalAgentUseCase } from '@ai/application/use-cases/retrieval-agent.use-case';
import { SaveRagTraceUseCase } from '@ai/application/use-cases/save-rag-trace.use-case';
import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { StreamFinalAnswerUseCase } from '@ai/application/use-cases/stream-final-answer.use-case';
import { TranscribeAudioBufferUseCase } from '@ai/application/use-cases/transcribe-audio-buffer.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { UpdateConversationMemoryUseCase } from '@ai/application/use-cases/update-conversation-memory.use-case';
import { UpsertUserMemoriesUseCase } from '@ai/application/use-cases/upsert-user-memories.use-case';
import { VerifierAgentUseCase } from '@ai/application/use-cases/verifier-agent.use-case';
import { ChatPromptBuilderAdapter } from '@ai/infrastructure/adapters/chat-prompt-builder.adapter';
import { CloudflareConversationSummarizerAdapter } from '@ai/infrastructure/adapters/cloudflare-conversation-summarizer.adapter';
import { CloudflareLlmAdapter } from '@ai/infrastructure/adapters/cloudflare-llm.adapter';
import { CloudflareMemoryExtractorAdapter } from '@ai/infrastructure/adapters/cloudflare-memory-extractor.adapter';
import { CloudflareStructuredLlmAdapter } from '@ai/infrastructure/adapters/cloudflare-structured-llm.adapter';
import { CloudflareTranscriptionAdapter } from '@ai/infrastructure/adapters/cloudflare-transcription.adapter';
import { CloudflareWorkersAiTextClient } from '@ai/infrastructure/adapters/cloudflare-workers-ai-text.client';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { ConversationTokenPublisherAdapter } from '@ai/infrastructure/adapters/conversation-token-publisher.adapter';
import { GeminiEmbeddingAdapter } from '@ai/infrastructure/adapters/gemini-embedding.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { LangGraphRagChatWorkflowAdapter } from '@ai/infrastructure/adapters/langgraph-rag-chat-workflow.adapter';
import { SimpleRerankerAdapter } from '@ai/infrastructure/adapters/simple-reranker.adapter';
import { ReelSemanticIndexAdapter } from '@ai/infrastructure/adapters/reel-semantic-index.adapter';
import { REEL_INDEX_QUERY_QUEUE } from '@common/processing/interfaces/semantic-index.interface';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { PrismaService } from '@ai/infrastructure/prisma/prisma.service';
import { PrismaConversationMemoryRepository } from '@ai/infrastructure/repositories/prisma-conversation-memory.repository';
import { PrismaRagTraceRepository } from '@ai/infrastructure/repositories/prisma-rag-trace.repository';
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
      {
        name: 'INDEX_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: REEL_INDEX_QUERY_QUEUE,
            queueOptions: { durable: true },
            retryAttempts: 3,
            retryDelay: 1_000,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AiController],
  providers: [
    PrismaService,

    StreamChatUseCase,
    GenerateEmbeddingUseCase,
    GenerateEmbeddingBatchUseCase,
    TranscribeAudioUseCase,
    TranscribeAudioBufferUseCase,

    GetRelevantUserMemoriesUseCase,
    ExtractUserMemoriesFromTurnUseCase,
    UpsertUserMemoriesUseCase,
    HandleConversationTurnCompletedUseCase,
    GetConversationMemoryUseCase,
    UpdateConversationMemoryUseCase,
    BackfillUserMemoryEmbeddingsUseCase,

    QueryRouterAgentUseCase,
    RetrievalAgentUseCase,
    MemoryAgentUseCase,
    GenerateDraftAnswerUseCase,
    StreamFinalAnswerUseCase,
    VerifierAgentUseCase,
    CheckContextSufficiencyUseCase,
    CreateNoContextAnswerUseCase,
    BuildRagCitationsUseCase,
    SaveRagTraceUseCase,
    MemoryWriterAgentUseCase,
    ExtractReelMetadataUseCase,

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
      useClass:
        process.env.AI_CHAT_PROVIDER === 'cloudflare'
          ? CloudflareLlmAdapter
          : GeminiLlmAdapter,
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
      provide: 'IReelSemanticIndexService',
      useClass: ReelSemanticIndexAdapter,
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
      provide: 'IRagTraceRepository',
      useClass: PrismaRagTraceRepository,
    },
    {
      provide: 'IMemoryExtractorService',
      useClass: CloudflareMemoryExtractorAdapter,
    },
    {
      provide: 'IConversationMemoryRepository',
      useClass: PrismaConversationMemoryRepository,
    },
    {
      provide: 'IConversationSummarizerService',
      useClass: CloudflareConversationSummarizerAdapter,
    },
    {
      provide: 'IStructuredLlmService',
      useClass: CloudflareStructuredLlmAdapter,
    },
    {
      provide: 'IChatPromptBuilder',
      useClass: ChatPromptBuilderAdapter,
    },
    {
      provide: 'IRagChatWorkflow',
      useClass: LangGraphRagChatWorkflowAdapter,
    },

    CloudflareWorkersAiTextClient,
  ],
})
export class AiServiceModule {}
