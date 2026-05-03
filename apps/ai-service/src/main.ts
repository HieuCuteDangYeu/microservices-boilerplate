import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AiServiceModule } from './ai-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AiServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
        queue: 'ai_queue',
        queueOptions: { durable: true },
        heartbeat: 60,
        retryAttempts: 10,
        retryDelay: 3000,
      },
    },
  );
  await app.listen();
}
void bootstrap();
