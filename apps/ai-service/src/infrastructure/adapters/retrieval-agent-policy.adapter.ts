import type { IRetrievalAgentPolicy } from '@ai/domain/interfaces/retrieval-agent-policy.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RetrievalAgentPolicyAdapter implements IRetrievalAgentPolicy {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    const configured = this.config
      .get<string>('RAG_TOOL_CALLING_ENABLED')
      ?.trim()
      .toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return this.config.get<string>('NODE_ENV')?.trim().toLowerCase() !== 'production';
  }

  get model(): string | undefined {
    return this.config.get<string>('CLOUDFLARE_TOOL_MODEL');
  }

  get maxSteps(): number {
    return this.boundedInt('RAG_TOOL_MAX_STEPS', 3, 1, 5);
  }

  get maxParallelCalls(): number {
    return this.boundedInt('RAG_TOOL_MAX_PARALLEL_CALLS', 2, 1, 4);
  }

  get callTimeoutMs(): number {
    return this.boundedInt('RAG_TOOL_CALL_TIMEOUT_MS', 8_000, 1_000, 30_000);
  }

  private boundedInt(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, Math.round(value)))
      : fallback;
  }
}
