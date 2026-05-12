import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { CallServiceModule } from './call-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CallServiceModule);
  const configService = app.get(ConfigService);

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [
        configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672',
      ],
      queue: 'call_queue',
      queueOptions: { durable: true },
    },
  });

  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  await app.startAllMicroservices();

  const port = configService.get<number>('CALL_PORT') || 3006;
  await app.listen(port);

  console.log(`Call service is running on: http://localhost:${port}/api`);
}

void bootstrap();
