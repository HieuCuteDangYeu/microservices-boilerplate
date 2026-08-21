import type { IUserMemoryRetrievalPolicy } from '@ai/domain/interfaces/user-memory-retrieval-policy.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserMemoryRetrievalPolicyAdapter
  implements IUserMemoryRetrievalPolicy
{
  constructor(private readonly config: ConfigService) {}

  get semanticRetrievalEnabled(): boolean {
    return this.boolean('AI_USER_MEMORY_SEMANTIC_RETRIEVAL_ENABLED', true);
  }

  get expectedEmbeddingDimensions(): number {
    const value = Number(
      this.config.get<string>('AI_USER_MEMORY_EMBEDDING_DIMENSIONS') ??
        this.config.get<string>('GEMINI_EMBEDDING_DIMENSIONS') ??
        '384',
    );
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 384;
  }

  get minSemanticScore(): number {
    return this.number('AI_USER_MEMORY_MIN_SEMANTIC_SCORE', 0.42, -1, 1);
  }

  get minConfidence(): number {
    return this.number('AI_USER_MEMORY_MIN_CONFIDENCE', 0.5, 0, 1);
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);
    return value === undefined ? fallback : value.toLowerCase() === 'true';
  }

  private number(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(Math.max(value, min), max)
      : fallback;
  }
}
