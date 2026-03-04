import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Import UseCases & Infra
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CreateConversationUseCase } from 'apps/conversation-service/src/application/use-cases/create-conversastion.use-case';
import { GetConversationUseCase } from 'apps/conversation-service/src/application/use-cases/get-conversation.use-case';
import { GetMessagesUseCase } from 'apps/conversation-service/src/application/use-cases/get-messages.use-case';
import { GetUserConversationsUseCase } from 'apps/conversation-service/src/application/use-cases/get-user-conversations.use-case';
import { UserServiceAdapter } from 'apps/conversation-service/src/infrastructure/adapters/user-service.adapter';
import { ConversationMicroserviceController } from 'apps/conversation-service/src/infrastructure/controllers/conversation.controller';
import { KeyMicroserviceController } from 'apps/conversation-service/src/infrastructure/controllers/key.controller';
import { PrismaService } from 'apps/conversation-service/src/infrastructure/prisma/prisma.service';
import { AesEncryptionRepository } from 'apps/conversation-service/src/infrastructure/repositories/aes-encryption.repository';
import { PrismaChatRepository } from 'apps/conversation-service/src/infrastructure/repositories/prisma-chat.repository';
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
    GetMessagesUseCase,
    GetConversationUseCase,
    CreateConversationUseCase,
    GetUserConversationsUseCase,

    // --- Repositories ---
    PrismaChatRepository,
    PrismaKeyBundleRepository,

    {
      provide: 'IUserService',
      useClass: UserServiceAdapter,
    },
    {
      provide: 'IChatRepository',
      useClass: PrismaChatRepository,
    },
    {
      provide: 'IEncryptionRepository', // Token để inject
      useClass: AesEncryptionRepository, // Class thực thi
    },

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
