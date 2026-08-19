import { AnalyzeVisualFrameUseCase } from '@ai/application/use-cases/analyze-visual-frame.use-case';
import { BackfillUserMemoryEmbeddingsUseCase } from '@ai/application/use-cases/backfill-user-memory-embeddings.use-case';
import { BuildRagCitationsUseCase } from '@ai/application/use-cases/build-rag-citations.use-case';
import { CheckContextSufficiencyUseCase } from '@ai/application/use-cases/check-context-sufficiency.use-case';
import { CountDocumentTokensUseCase } from '@ai/application/use-cases/count-document-tokens.use-case';
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
import { ReviewIndexQualityUseCase } from '@ai/application/use-cases/review-index-quality.use-case';
import { RewriteRetrievalQueryUseCase } from '@ai/application/use-cases/rewrite-retrieval-query.use-case';
import { SaveRagTraceUseCase } from '@ai/application/use-cases/save-rag-trace.use-case';
import { StreamChatUseCase } from '@ai/application/use-cases/stream-chat.use-case';
import { StreamFinalAnswerUseCase } from '@ai/application/use-cases/stream-final-answer.use-case';
import { ToolCallingRetrievalAgentUseCase } from '@ai/application/use-cases/tool-calling-retrieval-agent.use-case';
import { TranscribeAudioBufferUseCase } from '@ai/application/use-cases/transcribe-audio-buffer.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { UpdateConversationMemoryUseCase } from '@ai/application/use-cases/update-conversation-memory.use-case';
import { UpsertUserMemoriesUseCase } from '@ai/application/use-cases/upsert-user-memories.use-case';
import { VerifierAgentUseCase } from '@ai/application/use-cases/verifier-agent.use-case';
import { ChatPromptBuilderAdapter } from '@ai/infrastructure/adapters/chat-prompt-builder.adapter';
import { CloudflareCitationAttributionAdapter } from '@ai/infrastructure/adapters/cloudflare-citation-attribution.adapter';
import { CloudflareConversationSummarizerAdapter } from '@ai/infrastructure/adapters/cloudflare-conversation-summarizer.adapter';
import { CloudflareCrossEncoderRerankerAdapter } from '@ai/infrastructure/adapters/cloudflare-cross-encoder-reranker.adapter';
import { CloudflareLlmAdapter } from '@ai/infrastructure/adapters/cloudflare-llm.adapter';
import { CloudflareMemoryExtractorAdapter } from '@ai/infrastructure/adapters/cloudflare-memory-extractor.adapter';
import { CloudflareStructuredLlmAdapter } from '@ai/infrastructure/adapters/cloudflare-structured-llm.adapter';
import { CloudflareToolCallingLlmAdapter } from '@ai/infrastructure/adapters/cloudflare-tool-calling-llm.adapter';
import { CloudflareTranscriptionAdapter } from '@ai/infrastructure/adapters/cloudflare-transcription.adapter';
import { CloudflareVisionAdapter } from '@ai/infrastructure/adapters/cloudflare-vision.adapter';
import { CloudflareWorkersAiTextClient } from '@ai/infrastructure/adapters/cloudflare-workers-ai-text.client';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { ConversationTokenPublisherAdapter } from '@ai/infrastructure/adapters/conversation-token-publisher.adapter';
import { GeminiEmbeddingAdapter } from '@ai/infrastructure/adapters/gemini-embedding.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { LangGraphRagChatWorkflowAdapter } from '@ai/infrastructure/adapters/langgraph-rag-chat-workflow.adapter';
import { ReelSemanticIndexAdapter } from '@ai/infrastructure/adapters/reel-semantic-index.adapter';
import { SimpleRerankerAdapter } from '@ai/infrastructure/adapters/simple-reranker.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { IndexQualityAgentController } from '@ai/infrastructure/controllers/index-quality-agent.controller';
import { PrismaService } from '@ai/infrastructure/prisma/prisma.service';
import { PrismaConversationMemoryRepository } from '@ai/infrastructure/repositories/prisma-conversation-memory.repository';
import { PrismaRagHierarchyShadowObservationRepository } from '@ai/infrastructure/repositories/prisma-rag-hierarchy-shadow-observation.repository';
import { PrismaRagTraceRepository } from '@ai/infrastructure/repositories/prisma-rag-trace.repository';
import { PrismaUserMemoryRepository } from '@ai/infrastructure/repositories/prisma-user-memory.repository';
import { R2AudioStorageService } from '@ai/infrastructure/services/r2-audio-storage.service';
import { REEL_INDEX_QUERY_QUEUE } from '@common/processing/interfaces/semantic-index.interface';
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
  controllers: [AiController, IndexQualityAgentController],
  providers: [
    PrismaService,
    SimpleRerankerAdapter,

    StreamChatUseCase,
    GenerateEmbeddingUseCase,
    GenerateEmbeddingBatchUseCase,
    CountDocumentTokensUseCase,
    TranscribeAudioUseCase,
    TranscribeAudioBufferUseCase,
    AnalyzeVisualFrameUseCase,

    GetRelevantUserMemoriesUseCase,
    ExtractUserMemoriesFromTurnUseCase,
    UpsertUserMemoriesUseCase,
    HandleConversationTurnCompletedUseCase,
    GetConversationMemoryUseCase,
    UpdateConversationMemoryUseCase,
    BackfillUserMemoryEmbeddingsUseCase,

    QueryRouterAgentUseCase,
    {
      provide: 'IRetrievalAgentPolicy',
      useFactory: (config: ConfigService) => {
        const configured = config
          .get<string>('RAG_TOOL_CALLING_ENABLED')
          ?.trim()
          .toLowerCase();
        const enabled =
          configured === 'true'
            ? true
            : configured === 'false'
              ? false
              : config.get<string>('NODE_ENV')?.trim().toLowerCase() !==
                'production';
        const boundedInt = (
          key: string,
          fallback: number,
          minimum: number,
          maximum: number,
        ) => {
          const value = Number(config.get<string>(key) ?? fallback);
          return Number.isFinite(value)
            ? Math.min(maximum, Math.max(minimum, Math.round(value)))
            : fallback;
        };

        return {
          enabled,
          model: config.get<string>('CLOUDFLARE_TOOL_MODEL'),
          maxSteps: boundedInt('RAG_TOOL_MAX_STEPS', 3, 1, 5),
          maxParallelCalls: boundedInt(
            'RAG_TOOL_MAX_PARALLEL_CALLS',
            2,
            1,
            4,
          ),
          callTimeoutMs: boundedInt(
            'RAG_TOOL_CALL_TIMEOUT_MS',
            8_000,
            1_000,
            30_000,
          ),
        };
      },
      inject: [ConfigService],
    },
    {
      provide: 'IRetrievalEngine',
      useFactory: (
        structuredLlmService,
        embeddingService,
        contentService,
        semanticIndexService,
        rerankerService,
        hierarchyObservationRepository,
        config: ConfigService,
      ) =>
        new RetrievalAgentUseCase(
          structuredLlmService,
          embeddingService,
          contentService,
          semanticIndexService,
          rerankerService,
          hierarchyObservationRepository,
          config,
        ),
      inject: [
        'IStructuredLlmService',
        'IEmbeddingService',
        'IContentService',
        'IReelSemanticIndexService',
        'IRerankerService',
        'IRagHierarchyShadowObservationRepository',
        ConfigService,
      ],
    },
    ToolCallingRetrievalAgentUseCase,
    {
      provide: RetrievalAgentUseCase,
      useExisting: ToolCallingRetrievalAgentUseCase,
    },
    RewriteRetrievalQueryUseCase,
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
    ReviewIndexQualityUseCase,

    {
      provide: 'IEmbeddingService',
      useClass: GeminiEmbeddingAdapter,
    },
    {
      provide: 'ITranscriptionService',
      useClass: CloudflareTranscriptionAdapter,
    },
    {
      provide: 'IVisionService',
      useClass: CloudflareVisionAdapter,
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
      useClass: CloudflareCrossEncoderRerankerAdapter,
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
      provide: 'IRagHierarchyShadowObservationRepository',
      useClass: PrismaRagHierarchyShadowObservationRepository,
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
      provide: 'IToolCallingLlmService',
      useClass: CloudflareToolCallingLlmAdapter,
    },
    {
      provide: 'ICitationAttributionService',
      useClass: CloudflareCitationAttributionAdapter,
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
