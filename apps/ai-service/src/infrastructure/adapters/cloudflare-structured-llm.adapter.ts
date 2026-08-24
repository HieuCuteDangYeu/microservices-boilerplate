import type {
  GenerateStructuredObjectInput,
  IStructuredLlmService,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface StructuredCallState {
  providerStatus: number | 'NETWORK_ERROR' | 'TIMEOUT';
  finishReason?: string;
  usage?: CloudflareChatCompletionResponse['usage'];
  errorCode?: string;
}

const MAX_STRUCTURED_TIMEOUT_MS = 120_000;

export class StructuredCompletionTruncatedError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_TRUNCATED';

  constructor(
    readonly model: string,
    readonly requestedMaxTokens: number,
    readonly finishReason: string,
  ) {
    super(
      `Structured completion was truncated (model=${model}, maxTokens=${requestedMaxTokens}, finishReason=${finishReason})`,
    );
    this.name = 'StructuredCompletionTruncatedError';
  }
}

export class StructuredCompletionInvalidJsonError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_INVALID_JSON';

  constructor() {
    super('Structured completion returned invalid JSON');
    this.name = 'StructuredCompletionInvalidJsonError';
  }
}

export class StructuredCompletionSchemaError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_SCHEMA_INVALID';

  constructor() {
    super('Structured completion failed local schema validation');
    this.name = 'StructuredCompletionSchemaError';
  }
}

export class StructuredCompletionEmptyContentError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_EMPTY_CONTENT';

  constructor() {
    super('Structured completion returned empty content');
    this.name = 'StructuredCompletionEmptyContentError';
  }
}

export class StructuredCompletionProviderError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_PROVIDER_ERROR';

  constructor(
    readonly model: string,
    readonly status?: number,
  ) {
    super(
      status
        ? `Structured completion provider request failed (model=${model}, status=${status})`
        : `Structured completion provider request failed (model=${model})`,
    );
    this.name = 'StructuredCompletionProviderError';
  }
}

export class StructuredCompletionTimeoutError extends Error {
  readonly code = 'STRUCTURED_COMPLETION_TIMEOUT';

  constructor(
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(
      `Structured completion timed out (model=${model}, timeoutMs=${timeoutMs})`,
    );
    this.name = 'StructuredCompletionTimeoutError';
  }
}

@Injectable()
export class CloudflareStructuredLlmAdapter implements IStructuredLlmService {
  private readonly logger = new Logger(CloudflareStructuredLlmAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async generateObject<T>(input: GenerateStructuredObjectInput): Promise<T> {
    const model = input.model?.trim();
    if (!model) throw new Error('Structured LLM requests require a model role');

    const timeoutMs = this.resolveTimeout(input.timeoutMs);
    const maxTokens = input.maxTokens ?? 500;
    const startedAt = Date.now();
    const state: StructuredCallState = { providerStatus: 'NETWORK_ERROR' };

    try {
      return await this.generateObjectInternal<T>(
        input,
        model,
        timeoutMs,
        maxTokens,
        state,
      );
    } catch (error: unknown) {
      state.errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'STRUCTURED_COMPLETION_UNKNOWN_ERROR';
      if (error instanceof StructuredCompletionTimeoutError) {
        state.providerStatus = 'TIMEOUT';
      }
      throw error;
    } finally {
      const diagnostics = {
        modelRole: input.modelRole,
        model,
        providerStatus: state.providerStatus,
        latencyMs: Date.now() - startedAt,
        configuredTimeoutMs: timeoutMs,
        configuredMaxCompletionTokens: maxTokens,
        finishReason: state.finishReason,
        attempt: input.attempt ?? 1,
        usage: state.usage
          ? {
              inputTokens: state.usage.prompt_tokens,
              outputTokens: state.usage.completion_tokens,
              totalTokens: state.usage.total_tokens,
            }
          : undefined,
        errorCode: state.errorCode,
      };
      this.logger.debug(`[StructuredCall] ${JSON.stringify(diagnostics)}`);
      try {
        input.onDiagnostics?.(diagnostics);
      } catch {
        this.logger.warn('Structured call diagnostics callback failed');
      }
    }
  }

  private async generateObjectInternal<T>(
    input: GenerateStructuredObjectInput,
    model: string,
    timeoutMs: number,
    maxTokens: number,
    state: StructuredCallState,
  ): Promise<T> {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );

    const apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
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
          max_completion_tokens: maxTokens,
          temperature: input.temperature ?? 0.1,
          ...this.reasoningEffort(),
          response_format: {
            type: 'json_schema',
            json_schema: input.jsonSchema,
          },
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new StructuredCompletionTimeoutError(model, timeoutMs);
      }
      throw new StructuredCompletionProviderError(model);
    } finally {
      clearTimeout(timeout);
    }

    state.providerStatus = response.status;

    let json: CloudflareChatCompletionResponse;
    try {
      json = (await response.json()) as CloudflareChatCompletionResponse;
    } catch {
      throw new StructuredCompletionProviderError(model, response.status);
    }

    if (!response.ok) {
      this.logger.warn(
        `Cloudflare structured completion failed (model=${model}, status=${response.status})`,
      );
      throw new StructuredCompletionProviderError(model, response.status);
    }

    const choice = json.choices?.[0];
    state.finishReason = choice?.finish_reason ?? undefined;
    state.usage = json.usage;
    if (choice?.finish_reason === 'length') {
      throw new StructuredCompletionTruncatedError(
        model,
        maxTokens,
        choice.finish_reason,
      );
    }
    const content = choice?.message?.content;

    if (!content) {
      throw new StructuredCompletionEmptyContentError();
    }

    if (typeof content === 'object') {
      this.validateLocalSchema(
        content,
        input.jsonSchema as unknown as Record<string, unknown>,
      );
      return content as T;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseJsonObject(content);
    } catch {
      throw new StructuredCompletionInvalidJsonError();
    }
    this.validateLocalSchema(
      parsed,
      input.jsonSchema as unknown as Record<string, unknown>,
    );
    return parsed as T;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    return JSON.parse(content.trim()) as Record<string, unknown>;
  }

  private validateLocalSchema(
    value: unknown,
    schema: Record<string, unknown>,
  ): void {
    try {
      this.validateSchema(value, schema);
    } catch {
      throw new StructuredCompletionSchemaError();
    }
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
      ? Math.min(
          MAX_STRUCTURED_TIMEOUT_MS,
          Math.max(500, Math.round(requested)),
        )
      : 8_000;
  }
}
