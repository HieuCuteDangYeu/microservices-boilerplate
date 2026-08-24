import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type {
  GenerateEmbeddingRequest,
  GenerateEmbeddingResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareEmbeddingEnvelope {
  success?: boolean;
  result?: { data?: number[][]; shape?: number[] };
  errors?: Array<{ message?: string } | string>;
}

@Injectable()
export class CloudflareEmbeddingAdapter implements IEmbeddingService {
  constructor(private readonly config: ConfigService) {}

  async generateVector(
    input: GenerateEmbeddingRequest,
  ): Promise<GenerateEmbeddingResult> {
    const text = input.text.trim();
    if (!text) throw new Error('Embedding input text cannot be empty');

    const model = this.required('AI_EMBEDDING_MODEL');
    const dimensions = this.positiveInt('AI_EMBEDDING_DIMENSIONS', 4_096);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.positiveInt('AI_EMBEDDING_TIMEOUT_MS', 120_000),
    );
    timeout.unref();

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.required(
          'CLOUDFLARE_ACCOUNT_ID',
        )}/ai/run/${model}`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ text: [text], truncate_inputs: false }),
          signal: controller.signal,
        },
      );
      const rawBody = await response.text();
      const payload = this.parse(rawBody);
      const values = payload.result?.data?.[0];
      if (
        !response.ok ||
        payload.success === false ||
        !Array.isArray(values) ||
        values.length !== dimensions ||
        values.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          this.errorMessage(
            payload,
            response.ok ? '' : rawBody,
            `Cloudflare embedding must return ${dimensions} finite values`,
          ),
        );
      }

      return {
        values: this.normalize(values),
        model,
        dimensions,
        provider: 'cloudflare-workers-ai',
        version: this.required('AI_EMBEDDING_VERSION'),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  countTokens(_model: string, text: string): Promise<number> {
    const normalized = text.normalize('NFKC').trim();
    if (!normalized) throw new Error('Token counting requires non-empty text');
    return Promise.resolve(
      (normalized.match(/[\p{L}\p{N}]+|[^\s]/gu) ?? []).length,
    );
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.required('CLOUDFLARE_API_TOKEN')}`,
      'Content-Type': 'application/json',
      'cf-aig-skip-cache': 'true',
    };
    if (this.boolean('CLOUDFLARE_AI_GATEWAY_ENABLED', true)) {
      headers['cf-aig-gateway-id'] = this.required('CLOUDFLARE_AI_GATEWAY_ID');
    }
    return headers;
  }

  private normalize(values: number[]): number[] {
    const magnitude = Math.sqrt(
      values.reduce((sum, value) => sum + value * value, 0),
    );
    if (!Number.isFinite(magnitude) || magnitude === 0)
      throw new Error('Cloudflare embedding vector has invalid magnitude');
    return values.map((value) => value / magnitude);
  }

  private parse(raw: string): CloudflareEmbeddingEnvelope {
    try {
      return JSON.parse(raw) as CloudflareEmbeddingEnvelope;
    } catch {
      return {};
    }
  }

  private errorMessage(
    payload: CloudflareEmbeddingEnvelope,
    raw: string,
    fallback: string,
  ): string {
    const errors = (payload.errors ?? [])
      .map((error) => (typeof error === 'string' ? error : error.message))
      .filter((value): value is string => Boolean(value));
    return errors.join('; ') || raw.trim() || fallback;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new Error(`Missing required AI configuration: ${key}`);
    return value;
  }

  private positiveInt(key: string, max: number): number {
    const value = Number(this.required(key));
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`Invalid ${key}`);
    return value;
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
}
