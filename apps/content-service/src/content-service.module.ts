import { BackfillReelChunksUseCase } from '@content/application/use-cases/backfill-reel-chunks.use-case';
import { ClaimReelProcessingAttemptUseCase } from '@content/application/use-cases/claim-reel-processing-attempt.use-case';
import { CreateReelShareLinkUseCase } from '@content/application/use-cases/create-reel-share-link.use-case';
import { CreateReelUseCase } from '@content/application/use-cases/create-reel.use-case';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetFriendsReelsUseCase } from '@content/application/use-cases/get-friends-reels.use-case';
import { GetProfileReelContextUseCase } from '@content/application/use-cases/get-profile-reel-context.use-case';
import { GetRecommendedReelsUseCase } from '@content/application/use-cases/get-recommended-reels.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { GetSearchSuggestionsUseCase } from '@content/application/use-cases/get-search-suggestions.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { ReprocessReelUseCase } from '@content/application/use-cases/reprocess-reel.use-case';
import { ResolveReelShareLinkUseCase } from '@content/application/use-cases/resolve-reel-share-link.use-case';
import { RevokeReelShareLinkUseCase } from '@content/application/use-cases/revoke-reel-share-link.use-case';
import { SearchPublicReelsUseCase } from '@content/application/use-cases/search-public-reels.use-case';
import { SearchReelContextUseCase } from '@content/application/use-cases/search-reel-context.use-case';
import { ShareReelUseCase } from '@content/application/use-cases/share-reel.use-case';
import { TrackReelEventsUseCase } from '@content/application/use-cases/track-reel-events.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { AiEmbeddingServiceAdapter } from '@content/infrastructure/adapters/ai-embedding-service.adapter';
import { ConversationMessageAdapter } from '@content/infrastructure/adapters/conversation-message.adapter';
import { FriendContentAccessAdapter } from '@content/infrastructure/adapters/friend-content-access.adapter';
import { FriendSharePolicyAdapter } from '@content/infrastructure/adapters/friend-share-policy.adapter';
import { ProcessingServiceAdapter } from '@content/infrastructure/adapters/processing-service.adapter';
import { RecommendationTelemetryServiceAdapter } from '@content/infrastructure/adapters/recommendation-telemetry-service.adapter';
import { UserServiceAdapter } from '@content/infrastructure/adapters/user-service.adapter';
import { ContentController } from '@content/infrastructure/controllers/content.controller';
import { PrismaService } from '@content/infrastructure/prisma/prisma.service';
import { ContentRepository } from '@content/infrastructure/repositories/content.repository';
import { RecommendationRepository } from '@content/infrastructure/repositories/recommendation.repository';
import { R2StorageService } from '@content/infrastructure/services/r2-storage.service';
import { RecommendationConfigService } from '@content/infrastructure/services/recommendation-config.service';
import { RecommendationRankingConfigService } from '@content/infrastructure/services/recommendation-ranking-config.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

function createRmqClientRegistration(name: string, queue: string) {
  return {
    name,
    useFactory: (configService: ConfigService) => {
      const heartbeat = Number(
        configService.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
      );

      return {
        transport: Transport.RMQ as const,
        options: {
          urls: [
            configService.get<string>('RABBITMQ_URL') ||
              'amqp://localhost:5672',
          ],
          queue,
          queueOptions: {
            durable: true,
          },
          heartbeat:
            Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
          retryAttempts: 10,
          retryDelay: 3000,
        },
      };
    },
    inject: [ConfigService],
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      createRmqClientRegistration('PROCESSING_SERVICE', 'processing_queue'),
      createRmqClientRegistration('AI_SERVICE_RMQ', 'ai_queue'),
      createRmqClientRegistration('FRIEND_SERVICE_RMQ', 'friend_queue'),
      createRmqClientRegistration('USER_SERVICE_RMQ', 'user_queue'),
      createRmqClientRegistration(
        'CONVERSATION_SERVICE_RMQ',
        'conversation_queue',
      ),
      createRmqClientRegistration('MONITORING_SERVICE_RMQ', 'monitoring_queue'),
    ]),
  ],
  controllers: [ContentController],
  providers: [
    PrismaService,
    ContentRepository,

    CreateReelUseCase,
    ListReelsUseCase,
    GetReelUseCase,
    GetProfileReelContextUseCase,
    UpdateReelUseCase,
    DeleteReelUseCase,
    UpdateReelStatusUseCase,
    GetReelStatusUseCase,
    SearchReelContextUseCase,
    ShareReelUseCase,
    CreateReelShareLinkUseCase,
    ResolveReelShareLinkUseCase,
    RevokeReelShareLinkUseCase,
    BackfillReelChunksUseCase,
    TrackReelEventsUseCase,
    ReprocessReelUseCase,
    ClaimReelProcessingAttemptUseCase,
    SearchPublicReelsUseCase,
    GetRecommendedReelsUseCase,
    GetSearchSuggestionsUseCase,
    GetFriendsReelsUseCase,

    {
      provide: 'IRecommendationRepository',
      useClass: RecommendationRepository,
    },
    {
      provide: 'IRecommendationRankingConfig',
      useClass: RecommendationRankingConfigService,
    },
    {
      provide: 'IFriendContentAccessService',
      useClass: FriendContentAccessAdapter,
    },
    {
      provide: 'IContentRepository',
      useExisting: ContentRepository,
    },
    {
      provide: 'IReelViewEventRepository',
      useExisting: ContentRepository,
    },
    {
      provide: 'IStorageService',
      useClass: R2StorageService,
    },
    {
      provide: 'IProcessingService',
      useClass: ProcessingServiceAdapter,
    },
    {
      provide: 'IAiEmbeddingService',
      useClass: AiEmbeddingServiceAdapter,
    },
    {
      provide: 'IFriendSharePolicyService',
      useClass: FriendSharePolicyAdapter,
    },
    {
      provide: 'IUserService',
      useClass: UserServiceAdapter,
    },
    {
      provide: 'IConversationMessageService',
      useClass: ConversationMessageAdapter,
    },
    {
      provide: 'IRecommendationConfig',
      useClass: RecommendationConfigService,
    },
    {
      provide: 'IRecommendationTelemetryService',
      useClass: RecommendationTelemetryServiceAdapter,
    },
  ],
})
export class ContentServiceModule {}
