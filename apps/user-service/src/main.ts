import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserServiceModule } from '@user/user-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL || ''],
        queue: 'user_queue',
        queueOptions: {
          durable: true,
        },
      },
    },
  );

  await app.listen();
  console.log('User Service is listening on TCP Port 3001');
}
void bootstrap();
