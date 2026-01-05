import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { MailServiceModule } from './mail-service.module';

async function bootstrap() {
  const appContext =
    await NestFactory.createApplicationContext(MailServiceModule);
  const configService = appContext.get(ConfigService);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MailServiceModule,
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: configService.get<number>('TCP_PORT', 3003),
      },
    },
  );

  await app.listen();
}
void bootstrap();
