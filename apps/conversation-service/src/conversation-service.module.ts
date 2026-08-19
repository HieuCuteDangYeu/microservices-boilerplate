import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Import UseCases & Infra
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BuildBotMemoryContextUseCase } from 'apps/conversation-service/src/application/use-cases/build-bot-memory-context.use-case';
import { BuildCompletedTurnMemoryContextUseCase } from 'apps/conversation-service/src/application/use-cases/build-completed-turn-memory-context.use-case';
import { CreateConversationUseCase } from 'apps/conversation-service/src/application/use-cases/create-conversastion.use-case';
import { GetAnchorNewerMessagesUseCase } from 'apps/conversation-service/src/application/use-cases/get-anchor-newer-messages.use-case';
import { GetAnchorOlderMessagesUseCase } from 'apps/conversation-service/src/application/use-cases/get-anchor-older-messages.use-case';
import { GetConversationUseCase } from 'apps/conversation-service/src/application/use-cases/get-conversation.use-case';
import { GetMessagesAroundUseCase } from 'apps/conversation-service/src/application/use-cases/get-messages-around.use-case';
import { GetMessagesUseCase } from 'apps/conversation-service/src/application/use-cases/get-messages.use-case';
import { GetUserConversationsUseCase } from 'apps/conversation-service/src/application/use-cases/get-user-conversations.use-case';
import { ManageGroupConversationUseCase } from 'apps/conversation-service/src/application/use-cases/manage-group-conversation.use-case';
import { ProcessBotReplyUseCase } from 'apps/conversation-service/src/application/use-cases/process-bot-reply.use-case';
import { TriggerBotReplyUseCase } from 'apps/conversation-service/src/application/use-cases/trigger-bot-reply.use-case';
import { AiServiceAdapter } from 'apps/conversation-service/src/infrastructure/adapters/ai-service.adapter';
import { ChatMediaServiceAdapter } from 'apps/conversation-service/src/infrastructure/adapters/chat-media.service.adapter';
import { NotificationServiceAdapter } from 'apps/conversation-service/src/infrastructure/adapters/notification-service.adapter';
import { UserServiceAdapter } from 'apps/conversation-service/src/infrastructure/adapters/user-service.adapter';
import { ConversationMicroserviceController } from 'apps/conversation-service/src/infrastructure/controllers/conversation.controller';
import { KeyMicroserviceController } from 'apps/conversation-service/src/infrastructure/controllers/key.controller';
import { PrismaService } from 'apps/conversation-service/src/infrastructure/prisma/prisma.service';
import { AesEncryptionRepository } from 'apps/conversation-service/src/infrastructure/repositories/aes-encryption.repository';
import { PrismaConversationChatRepository } from 'apps/conversation-service/src/infrastructure/repositories/prisma-conversation-chat.repository';
import { PrismaKeyBundleRepository } from 'apps/conversation-service/src/infrastructure/repositories/prisma-key-bundle.repository';
import { SendMessageUseCase } from './application/use-cases/send-message.use-case';
import { ChatGateway } from './infrastructure/gateways/chat.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'USER_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'user_queue',
            queueOptions: { durable: true },
            heartbeat: 60,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'AI_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'ai_queue',
            queueOptions: { durable: true },
            heartbeat: 60,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'AUTH_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'auth_queue',
            queueOptions: { durable: true },
            heartbeat: 60,
            retryAttempts: 10,
            retryDelay: 3000,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'MEDIA_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'media_queue',
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
  controllers: [ConversationMicroserviceController, KeyMicroserviceController],
  providers: [
    PrismaService,
    ChatGateway, // Gateway vẫn phải có vì đây là nơi xử lý logic Socket

    // --- Use Cases ---
    SendMessageUseCase,
    GetMessagesAroundUseCase,
    GetAnchorOlderMessagesUseCase,
    GetAnchorNewerMessagesUseCase,
    GetMessagesUseCase,
    GetConversationUseCase,
    CreateConversationUseCase,
    ManageGroupConversationUseCase,
    GetUserConversationsUseCase,
    ProcessBotReplyUseCase,
    TriggerBotReplyUseCase,
    BuildBotMemoryContextUseCase,
    BuildCompletedTurnMemoryContextUseCase,

    // --- Repositories ---
    PrismaConversationChatRepository,
    PrismaKeyBundleRepository,

    {
      provide: 'IUserService',
      useClass: UserServiceAdapter,
    },
    {
      provide: 'IChatRepository',
      useExisting: PrismaConversationChatRepository,
    },
    {
      provide: 'IConversationMutationRepository',
      useExisting: PrismaConversationChatRepository,
    },
    {
      provide: 'IEncryptionRepository', // Token để inject
      useClass: AesEncryptionRepository, // Class thực thi
    },
    {
      provide: 'IAiService',
      useClass: AiServiceAdapter,
    },
    {
      provide: 'IChatMediaService',
      useClass: ChatMediaServiceAdapter,
    },
    NotificationServiceAdapter,

    // --- REDIS CLIENT (Để lưu cache tin nhắn - Giống Auth Service) ---
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
          tls: (config.get<string>('REDIS_HOST') ?? '').includes('upstash')
            ? { servername: config.get<string>('REDIS_HOST') }
            : undefined,
        });
      },
    },
  ],
})
export class ConversationServiceModule {}
