import { ApiGatewayModule } from '@gateway/api-gateway.module';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('Microservices API Gateway')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(new ZodValidationPipe());

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Gateway is running on: http://localhost:${port}/api`);
}
void bootstrap();
