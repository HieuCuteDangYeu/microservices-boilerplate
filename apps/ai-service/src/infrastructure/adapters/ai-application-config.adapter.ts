import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiApplicationConfigAdapter implements IAiApplicationConfig {
  constructor(private readonly config: ConfigService) {}

  get<T = string>(key: string): T | undefined {
    return this.config.get<T>(key);
  }
}
