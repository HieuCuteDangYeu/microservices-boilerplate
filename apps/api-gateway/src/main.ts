import { ApiGatewayModule } from '@gateway/api-gateway.module';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from 'nestjs-zod';

const parseOrigins = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  const allowedOrigins = new Set([
    ...parseOrigins(configService.get<string>('FRONTEND_URL')),
    ...parseOrigins(configService.get<string>('CALL_OPS_DASHBOARD_ORIGINS')),
    ...parseOrigins(configService.get<string>('BACKEND_URL')),
    ...(process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://localhost:3000']),
  ]);

  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
  });

  const config = new DocumentBuilder()
    .setTitle('Microservices API Gateway')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(new ZodValidationPipe());

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  console.log(`Gateway is running on: http://localhost:${port}/api`);
}
void bootstrap();
