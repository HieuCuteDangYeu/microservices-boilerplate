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

    const model = input.model?.trim();
    if (!model) throw new Error('Structured LLM requests require a model role');

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
          'cf-aig-skip-cache': 'true',
          ...this.gatewayHeaders(),
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
          ...this.reasoningEffort(),
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
      this.validateSchema(
        content,
        input.jsonSchema as unknown as Record<string, unknown>,
      );
      return content as T;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseJsonObject(content);
    } catch {
      throw new Error('Cloudflare structured LLM returned invalid JSON');
    }
    this.validateSchema(
      parsed,
      input.jsonSchema as unknown as Record<string, unknown>,
    );
    return parsed as T;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    return JSON.parse(content.trim()) as Record<string, unknown>;
  }

  private gatewayHeaders(): Record<string, string> {
    const enabled =
      this.configService
        .get<string>('CLOUDFLARE_AI_GATEWAY_ENABLED')
        ?.trim()
        .toLowerCase() !== 'false';
    return enabled
      ? {
          'cf-aig-gateway-id': this.configService.getOrThrow<string>(
            'CLOUDFLARE_AI_GATEWAY_ID',
          ),
        }
      : {};
  }

  private reasoningEffort(): Record<string, string> {
    const value = this.configService
      .get<string>('CLOUDFLARE_STRUCTURED_REASONING_EFFORT')
      ?.trim()
      .toLowerCase();
    return value === 'low' || value === 'medium' || value === 'high'
      ? { reasoning_effort: value }
      : {};
  }

  private validateSchema(
    value: unknown,
    schema: Record<string, unknown>,
  ): void {
    const type = schema['type'];
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      const record = value as Record<string, unknown>;
      const properties = (schema['properties'] ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const required = Array.isArray(schema['required'])
        ? (schema['required'] as string[])
        : [];
      if (required.some((key) => !(key in record)))
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      if (
        schema['additionalProperties'] === false &&
        Object.keys(record).some((key) => !(key in properties))
      )
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (key in record) this.validateSchema(record[key], propertySchema);
      }
      return;
    }
    if (type === 'array') {
      if (!Array.isArray(value))
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      const minItems = Number(schema['minItems']);
      const maxItems = Number(schema['maxItems']);
      if (
        (Number.isFinite(minItems) && value.length < minItems) ||
        (Number.isFinite(maxItems) && value.length > maxItems)
      )
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      const items = schema['items'];
      if (items && typeof items === 'object')
        value.forEach((item) =>
          this.validateSchema(item, items as Record<string, unknown>),
        );
      return;
    }
    if (type === 'string') {
      if (typeof value !== 'string')
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      const minLength = Number(schema['minLength']);
      const maxLength = Number(schema['maxLength']);
      if (
        (Number.isFinite(minLength) && value.length < minLength) ||
        (Number.isFinite(maxLength) && value.length > maxLength)
      )
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
    }
    if (type === 'boolean' && typeof value !== 'boolean')
      throw new Error('Structured LLM response failed local schema validation');
    if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
      const minimum = Number(schema['minimum']);
      const maximum = Number(schema['maximum']);
      if (
        (Number.isFinite(minimum) && value < minimum) ||
        (Number.isFinite(maximum) && value > maximum)
      )
        throw new Error(
          'Structured LLM response failed local schema validation',
        );
    }
    const allowed = schema['enum'];
    if (Array.isArray(allowed) && !allowed.includes(value))
      throw new Error('Structured LLM response failed local schema validation');
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
