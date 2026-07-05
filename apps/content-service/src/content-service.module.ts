import { TrackReelEventsUseCase } from '@ai/application/use-cases/track-reel-events.use-case';
import { BackfillReelChunksUseCase } from '@content/application/use-cases/backfill-reel-chunks.use-case';
import { ClaimReelProcessingAttemptUseCase } from '@content/application/use-cases/claim-reel-processing-attempt.use-case';
import { CreateReelShareLinkUseCase } from '@content/application/use-cases/create-reel-share-link.use-case';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetProfileReelContextUseCase } from '@content/application/use-cases/get-profile-reel-context.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { IncrementReelViewUseCase } from '@content/application/use-cases/increment-reel-view.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { ReprocessReelUseCase } from '@content/application/use-cases/reprocess-reel.use-case';
import { ResolveReelShareLinkUseCase } from '@content/application/use-cases/resolve-reel-share-link.use-case';
import { RevokeReelShareLinkUseCase } from '@content/application/use-cases/revoke-reel-share-link.use-case';
import { SearchReelContextUseCase } from '@content/application/use-cases/search-reel-context.use-case';
import { ShareReelUseCase } from '@content/application/use-cases/share-reel.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { AiEmbeddingServiceAdapter } from '@content/infrastructure/adapters/ai-embedding-service.adapter';
import { ConversationMessageAdapter } from '@content/infrastructure/adapters/conversation-message.adapter';
import { FriendSharePolicyAdapter } from '@content/infrastructure/adapters/friend-share-policy.adapter';
import { ProcessingServiceAdapter } from '@content/infrastructure/adapters/processing-service.adapter';
import { R2StorageService } from '@content/infrastructure/services/r2-storage.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CreateReelUseCase } from './application/use-cases/create-reel.use-case';
import { ContentController } from './infrastructure/controllers/content.controller';
import { ContentRepository } from './infrastructure/repositories/content.repository';

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
          queueOptions: { durable: true },
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
      createRmqClientRegistration(
        'CONVERSATION_SERVICE_RMQ',
        'conversation_queue',
      ),
    ]),
  ],
  controllers: [ContentController],
  providers: [
    CreateReelUseCase,
    ListReelsUseCase,
    GetReelUseCase,
    GetProfileReelContextUseCase,
    IncrementReelViewUseCase,
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
    {
      provide: 'IContentRepository',
      useClass: ContentRepository,
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
      provide: 'IConversationMessageService',
      useClass: ConversationMessageAdapter,
    },
  ],
})
export class ContentServiceModule {}
