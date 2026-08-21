import type { IVerifierAgentPolicy } from '@ai/domain/interfaces/verifier-agent-policy.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VerifierAgentPolicyAdapter implements IVerifierAgentPolicy {
  constructor(private readonly config: ConfigService) {}

  get model(): string {
    return (
      this.config.get<string>('CLOUDFLARE_VERIFIER_MODEL') ||
      '@cf/meta/llama-3.1-8b-instruct-fast'
    );
  }

  get timeoutMs(): number {
    const configured = Number(
      this.config.get<string>('AI_RAG_VERIFIER_TIMEOUT_MS') ?? '8000',
    );
    return Number.isFinite(configured)
      ? Math.min(30_000, Math.max(500, Math.round(configured)))
      : 8_000;
  }
}
