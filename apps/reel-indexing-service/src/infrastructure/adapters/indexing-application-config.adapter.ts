import type { IIndexingApplicationConfig } from '@indexing/domain/interfaces/indexing-application-config.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IndexingApplicationConfigAdapter implements IIndexingApplicationConfig {
  constructor(private readonly config: ConfigService) {}

  get<T = string>(key: string): T | undefined {
    return this.config.get<T>(key);
  }

  transcriptionIdentity(): {
    provider: string;
    model: string;
    version: string;
  } {
    return {
      provider: this.required('INDEX_TRANSCRIPTION_PROVIDER'),
      model: this.required('AI_TRANSCRIPTION_MODEL'),
      version: this.required('AI_TRANSCRIPTION_VERSION'),
    };
  }

  embeddingIdentity(): {
    model: string;
    dimensions: number;
    version: string;
  } {
    const dimensions = Number(this.required('AI_EMBEDDING_DIMENSIONS'));
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error(
        'Invalid indexing configuration: AI_EMBEDDING_DIMENSIONS',
      );
    }
    return {
      model: this.required('AI_EMBEDDING_MODEL'),
      dimensions,
      version: this.required('AI_EMBEDDING_VERSION'),
    };
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value)
      throw new Error(`Missing required indexing configuration: ${key}`);
    return value;
  }
}
