import type { IIndexQualityAgentPolicy } from '@indexing/domain/interfaces/index-quality-agent-policy.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IndexQualityAgentPolicyAdapter implements IIndexQualityAgentPolicy {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    const configured = this.config
      .get<string>('INDEX_QUALITY_AGENT_ENABLED')
      ?.trim()
      .toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return (
      this.config.get<string>('NODE_ENV')?.trim().toLowerCase() !== 'production'
    );
  }

  get enforced(): boolean {
    return this.boolean('INDEX_QUALITY_AGENT_ENFORCE', false);
  }

  get required(): boolean {
    return this.boolean('INDEX_QUALITY_AGENT_REQUIRED', false);
  }

  get maxDocuments(): number {
    const value = Number(
      this.config.get<string>('INDEX_QUALITY_AGENT_MAX_DOCUMENTS') ?? '36',
    );
    return Number.isFinite(value)
      ? Math.min(80, Math.max(8, Math.round(value)))
      : 36;
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
}
