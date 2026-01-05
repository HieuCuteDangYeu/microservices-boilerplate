import { MediaServiceModule } from '@media/media-service.module';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const appContext =
    await NestFactory.createApplicationContext(MediaServiceModule);
  const configService = appContext.get(ConfigService);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MediaServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: configService.get<number>('TCP_PORT', 3004),
      },
    },
  );

  await app.listen();
}
void bootstrap();
