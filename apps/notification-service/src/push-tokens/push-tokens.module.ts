import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import Redis from 'ioredis';

import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';

@Module({
  controllers: [PushTokensController],
  providers: [
    PushTokensService,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
          tls: (config.get<string>('REDIS_HOST') ?? '').includes('upstash')
            ? { servername: config.get<string>('REDIS_HOST') }
            : undefined,
        }),
    },
  ],
  exports: [PushTokensService],
})
export class PushTokensModule {}
