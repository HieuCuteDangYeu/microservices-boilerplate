import { ProcessChatUseCase } from '@ai/application/use-cases/process-chat.use-case';
import { ContentServiceAdapter } from '@ai/infrastructure/adapters/content-service.adapter';
import { GeminiLlmAdapter } from '@ai/infrastructure/adapters/gemini-llm.adapter';
import { XenovaEmbeddingAdapter } from '@ai/infrastructure/adapters/xenova-embedding.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { KnowledgeRepository } from '@ai/infrastructure/repositories/knowledge.repository';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from './infrastructure/prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: 'CONTENT_SERVICE',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'content_queue',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AiController],
  providers: [
    PrismaService,
    ProcessChatUseCase,
    ContentServiceAdapter,
    GeminiLlmAdapter,
    {
      provide: 'IKnowledgeRepository',
      useClass: KnowledgeRepository,
    },
    {
      provide: 'IContentService',
      useClass: ContentServiceAdapter,
    },
    {
      provide: 'ILlmService',
      useClass: GeminiLlmAdapter,
    },
    {
      provide: 'IEmbeddingService',
      useClass: XenovaEmbeddingAdapter,
    },
  ],
})
export class AiServiceModule {}
