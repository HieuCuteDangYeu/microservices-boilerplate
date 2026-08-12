import type {
  GenerateStructuredObjectInput,
  IStructuredLlmService,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Record<string, unknown>;
    };
  }>;
  error?: {
    message?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

@Injectable()
export class CloudflareStructuredLlmAdapter implements IStructuredLlmService {
  private readonly logger = new Logger(CloudflareStructuredLlmAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async generateObject<T>(input: GenerateStructuredObjectInput): Promise<T> {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );

    const apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );

    const model =
      input.model ||
      this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
      '@cf/meta/llama-3.1-8b-instruct';

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
    const timeoutMs = this.resolveTimeout(input.timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: input.systemPrompt,
            },
            {
              role: 'user',
              content: input.userPrompt,
            },
          ],
          max_tokens: input.maxTokens ?? 500,
          temperature: input.temperature ?? 0.1,
          response_format: {
            type: 'json_schema',
            json_schema: input.jsonSchema,
          },
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw new Error(
          `Cloudflare structured LLM request timed out after ${timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const json = (await response.json()) as CloudflareChatCompletionResponse;

    if (!response.ok) {
      const message =
        json.error?.message ||
        json.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join(', ') ||
        `Cloudflare structured LLM request failed with status ${response.status}`;

      this.logger.warn(message);
      throw new Error(message);
    }

    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Cloudflare structured LLM returned empty content');
    }

    if (typeof content === 'object') {
      return content as T;
    }

    try {
      return this.parseJsonObject(content) as T;
    } catch {
      throw new Error('Cloudflare structured LLM returned invalid JSON');
    }
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<
          string,
          unknown
        >;
      }
      throw new Error('No JSON object found');
    }
  }

  private resolveTimeout(requestTimeoutMs?: number): number {
    const configured = Number(
      this.configService.get<string>('CLOUDFLARE_STRUCTURED_LLM_TIMEOUT_MS') ??
        '8000',
    );
    const fallback = Number.isFinite(configured) ? configured : 8_000;
    const requested = Number(requestTimeoutMs ?? fallback);
    return Number.isFinite(requested)
      ? Math.min(30_000, Math.max(500, Math.round(requested)))
      : 8_000;
  }
}
