import type {
  GenerateStructuredObjectInput,
  IStructuredLlmService,
  StructuredJsonType,
  StructuredProviderFailureCategory,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyCloudflareProviderFailure } from './cloudflare-provider-error-classifier';

interface CloudflareChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Record<string, unknown>;
      tool_calls?: Array<{
        type?: string;
        function?: { name?: string; arguments?: unknown };
      }>;
    };
  }>;
  error?: {
    code?: number | string;
    message?: string;
  };
  errors?: Array<{
    code?: number | string;
    message?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

interface StructuredCallState {
  providerStatus: number | 'NETWORK_ERROR' | 'TIMEOUT';
  finishReason?: string;
  usage?: CloudflareChatCompletionResponse['usage'];
  errorCode?: string;
  providerCode?: number;
  providerCategory?: StructuredProviderFailureCategory;
  retryAfterMs?: number;
  requestId?: string;
  transient?: boolean;
  schemaPath?: string;
  schemaConstraint?: string;
  schemaVersion?: string;
  expectedType?: StructuredJsonType;
  actualJsonType?: StructuredJsonType;
  responseContentType?: StructuredJsonType;
  contentPresent?: boolean;
  toolCallsPresent?: boolean;
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

  constructor(
    readonly path: string,
    readonly constraint: string,
    readonly schemaVersion?: string,
    readonly expectedType?: StructuredJsonType,
    readonly actualJsonType?: StructuredJsonType,
  ) {
    super(
      `Structured completion failed local schema validation (path=${path}, constraint=${constraint})`,
    );
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
    readonly providerCode?: number,
    readonly retryAfterMs?: number,
    readonly requestId?: string,
    readonly transient = true,
    readonly providerCategory: StructuredProviderFailureCategory = 'UNKNOWN_PROVIDER_FAILURE',
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

class StructuredSchemaViolation extends Error {
  constructor(
    readonly path: string,
    readonly constraint: string,
    readonly expectedType?: StructuredJsonType,
    readonly actualJsonType?: StructuredJsonType,
  ) {
    super('Structured schema violation');
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
        state.transient = true;
        state.providerCategory = 'TRANSIENT_PROVIDER_FAILURE';
      }
      if (error instanceof StructuredCompletionProviderError) {
        state.providerCode = error.providerCode;
        state.retryAfterMs = error.retryAfterMs;
        state.requestId = error.requestId;
        state.transient = error.transient;
        state.providerCategory = error.providerCategory;
      }
      if (error instanceof StructuredCompletionSchemaError) {
        state.schemaPath = error.path;
        state.schemaConstraint = error.constraint;
        state.schemaVersion = error.schemaVersion;
        state.expectedType = error.expectedType;
        state.actualJsonType = error.actualJsonType;
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
        endpointContract: this.endpointContract(input),
        responseContentType: state.responseContentType,
        contentPresent: state.contentPresent,
        toolCallsPresent: state.toolCallsPresent,
        attempt: input.attempt ?? 1,
        usage: state.usage
          ? {
              inputTokens: state.usage.prompt_tokens,
              outputTokens: state.usage.completion_tokens,
              totalTokens: state.usage.total_tokens,
              reasoningTokens: this.reasoningTokens(state.usage),
            }
          : undefined,
        errorCode: state.errorCode,
        providerCode: state.providerCode,
        providerCategory: state.providerCategory,
        retryAfterMs: state.retryAfterMs,
        requestId: state.requestId,
        transient: state.transient,
        schemaPath: state.schemaPath,
        schemaConstraint: state.schemaConstraint,
        schemaVersion: state.schemaVersion ?? input.schemaVersion,
        expectedType: state.expectedType,
        actualJsonType: state.actualJsonType,
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
          ...this.outputContract(input),
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new StructuredCompletionTimeoutError(model, timeoutMs);
      }
      throw new StructuredCompletionProviderError(
        model,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'TRANSIENT_PROVIDER_FAILURE',
      );
    } finally {
      clearTimeout(timeout);
    }

    state.providerStatus = response.status;
    const retryAfterMs = this.parseRetryAfter(
      response.headers?.get('retry-after'),
    );
    const requestId = response.headers?.get('cf-ray') ?? undefined;

    let json: CloudflareChatCompletionResponse;
    try {
      json = (await response.json()) as CloudflareChatCompletionResponse;
    } catch {
      const classification = classifyCloudflareProviderFailure({
        status: response.status,
        retryAfterMs,
      });
      throw new StructuredCompletionProviderError(
        model,
        response.status,
        undefined,
        retryAfterMs,
        requestId,
        classification.transient,
        classification.category,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `Cloudflare structured completion failed (model=${model}, status=${response.status})`,
      );
      const providerCode = this.providerCode(json);
      const classification = classifyCloudflareProviderFailure({
        status: response.status,
        providerCode,
        retryAfterMs,
        message: this.providerMessage(json),
      });
      throw new StructuredCompletionProviderError(
        model,
        response.status,
        providerCode,
        retryAfterMs,
        requestId,
        classification.transient,
        classification.category,
      );
    }

    const choice = json.choices?.[0];
    state.finishReason = choice?.finish_reason ?? undefined;
    state.usage = json.usage;
    const content = choice?.message?.content;
    state.responseContentType = this.jsonType(content);
    state.contentPresent =
      content !== undefined && content !== null && content !== '';
    state.toolCallsPresent =
      Array.isArray(choice?.message?.tool_calls) &&
      choice.message.tool_calls.length > 0;
    if (choice?.finish_reason === 'length') {
      throw new StructuredCompletionTruncatedError(
        model,
        maxTokens,
        choice.finish_reason,
      );
    }
    if (this.endpointContract(input) === 'CHAT_TOOL_CALL') {
      const calls = choice?.message?.tool_calls;
      if (
        !Array.isArray(calls) ||
        calls.length !== 1 ||
        calls[0]?.type !== 'function' ||
        calls[0]?.function?.name !== 'route_message'
      ) {
        throw new StructuredCompletionSchemaError(
          '$.tool_calls',
          'singleRouteTool',
          input.schemaVersion,
        );
      }
      const args = calls[0].function.arguments;
      if (
        typeof args !== 'string' &&
        (args === null || typeof args !== 'object' || Array.isArray(args))
      ) {
        throw new StructuredCompletionSchemaError(
          '$.tool_calls[0].function.arguments',
          'type',
          input.schemaVersion,
          'object',
          this.jsonType(args),
        );
      }
      let parsed: unknown = args;
      try {
        if (typeof args === 'string') parsed = JSON.parse(args);
      } catch {
        throw new StructuredCompletionInvalidJsonError();
      }
      this.validateLocalSchema(
        parsed,
        input.jsonSchema as unknown as Record<string, unknown>,
        input.schemaVersion,
      );
      return parsed as T;
    }

    if (!content) {
      throw new StructuredCompletionEmptyContentError();
    }

    if (typeof content === 'object') {
      this.validateLocalSchema(
        content,
        input.jsonSchema as unknown as Record<string, unknown>,
        input.schemaVersion,
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
      input.schemaVersion,
    );
    return parsed as T;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    return JSON.parse(content.trim()) as Record<string, unknown>;
  }

  private validateLocalSchema(
    value: unknown,
    schema: Record<string, unknown>,
    schemaVersion?: string,
  ): void {
    try {
      this.validateSchema(value, schema, '$');
    } catch (error: unknown) {
      if (error instanceof StructuredSchemaViolation) {
        throw new StructuredCompletionSchemaError(
          error.path,
          error.constraint,
          schemaVersion,
          error.expectedType,
          error.actualJsonType,
        );
      }
      throw new StructuredCompletionSchemaError('$', 'unknown', schemaVersion);
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
          'cf-aig-max-attempts': String(this.gatewayMaxAttempts()),
          'cf-aig-retry-delay': String(this.gatewayRetryDelay()),
          'cf-aig-backoff': this.gatewayBackoff(),
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

  private endpointContract(
    input: GenerateStructuredObjectInput,
  ): 'CHAT_JSON_SCHEMA' | 'CHAT_TOOL_CALL' {
    return input.modelRole === 'ROUTER' &&
      this.configService.get<string>('CLOUDFLARE_ROUTER_OUTPUT_CONTRACT') ===
        'CHAT_TOOL_CALL'
      ? 'CHAT_TOOL_CALL'
      : 'CHAT_JSON_SCHEMA';
  }

  private outputContract(
    input: GenerateStructuredObjectInput,
  ): Record<string, unknown> {
    if (this.endpointContract(input) === 'CHAT_TOOL_CALL') {
      // This tool only transports a decision. No business action is executed.
      // tool_choice is deliberately omitted: it is absent from the model schema.
      return {
        tools: [
          {
            type: 'function',
            function: {
              name: 'route_message',
              description:
                'Return the semantic routing decision by calling this tool exactly once with the six required fields. Do not answer in message content. This tool performs no external action.',
              parameters: input.jsonSchema,
            },
          },
        ],
      };
    }
    return {
      response_format: { type: 'json_schema', json_schema: input.jsonSchema },
    };
  }

  private jsonType(value: unknown): StructuredJsonType {
    if (value === undefined) return 'absent';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'object';
  }

  private reasoningTokens(
    usage: CloudflareChatCompletionResponse['usage'],
  ): number | undefined {
    const value = usage?.completion_tokens_details?.reasoning_tokens;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
  }

  private validateSchema(
    value: unknown,
    schema: Record<string, unknown>,
    path: string,
  ): void {
    const type = schema['type'];
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new StructuredSchemaViolation(
          path,
          'type',
          'object',
          this.jsonType(value),
        );
      const record = value as Record<string, unknown>;
      const properties = (schema['properties'] ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const required = Array.isArray(schema['required'])
        ? (schema['required'] as string[])
        : [];
      const missing = required.find((key) => !(key in record));
      if (missing)
        throw new StructuredSchemaViolation(`${path}.${missing}`, 'required');
      if (
        schema['additionalProperties'] === false &&
        Object.keys(record).some((key) => !(key in properties))
      )
        throw new StructuredSchemaViolation(path, 'additionalProperties');
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (key in record)
          this.validateSchema(record[key], propertySchema, `${path}.${key}`);
      }
      return;
    }
    if (type === 'array') {
      if (!Array.isArray(value))
        throw new StructuredSchemaViolation(
          path,
          'type',
          'array',
          this.jsonType(value),
        );
      const minItems = Number(schema['minItems']);
      const maxItems = Number(schema['maxItems']);
      if (
        (Number.isFinite(minItems) && value.length < minItems) ||
        (Number.isFinite(maxItems) && value.length > maxItems)
      )
        throw new StructuredSchemaViolation(
          path,
          Number.isFinite(minItems) && value.length < minItems
            ? 'minItems'
            : 'maxItems',
        );
      const items = schema['items'];
      if (items && typeof items === 'object')
        value.forEach((item, index) =>
          this.validateSchema(
            item,
            items as Record<string, unknown>,
            `${path}[${index}]`,
          ),
        );
      return;
    }
    if (type === 'string') {
      if (typeof value !== 'string')
        throw new StructuredSchemaViolation(
          path,
          'type',
          'string',
          this.jsonType(value),
        );
      const minLength = Number(schema['minLength']);
      const maxLength = Number(schema['maxLength']);
      if (
        (Number.isFinite(minLength) && value.length < minLength) ||
        (Number.isFinite(maxLength) && value.length > maxLength)
      )
        throw new StructuredSchemaViolation(
          path,
          Number.isFinite(minLength) && value.length < minLength
            ? 'minLength'
            : 'maxLength',
        );
    }
    if (type === 'boolean' && typeof value !== 'boolean')
      throw new StructuredSchemaViolation(
        path,
        'type',
        'boolean',
        this.jsonType(value),
      );
    if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new StructuredSchemaViolation(
          path,
          'type',
          'number',
          this.jsonType(value),
        );
      const minimum = Number(schema['minimum']);
      const maximum = Number(schema['maximum']);
      if (
        (Number.isFinite(minimum) && value < minimum) ||
        (Number.isFinite(maximum) && value > maximum)
      )
        throw new StructuredSchemaViolation(
          path,
          Number.isFinite(minimum) && value < minimum ? 'minimum' : 'maximum',
        );
    }
    const allowed = schema['enum'];
    if (Array.isArray(allowed) && !allowed.includes(value))
      throw new StructuredSchemaViolation(path, 'enum');
  }

  private providerCode(
    payload: CloudflareChatCompletionResponse,
  ): number | undefined {
    const values = [
      payload.error?.code,
      ...(payload.errors ?? []).map((error) => error.code),
    ];
    return values.map(Number).find(Number.isFinite);
  }

  private providerMessage(
    payload: CloudflareChatCompletionResponse,
  ): string | undefined {
    return [
      payload.error?.message,
      ...(payload.errors ?? []).map((error) => error.message),
    ].find((value): value is string => typeof value === 'string');
  }

  private parseRetryAfter(
    value: string | null | undefined,
  ): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.round(seconds * 1_000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
  }

  private gatewayMaxAttempts(): number {
    return this.integerConfig('CLOUDFLARE_AI_GATEWAY_MAX_ATTEMPTS', 1, 1, 5);
  }

  private gatewayRetryDelay(): number {
    return this.integerConfig(
      'CLOUDFLARE_AI_GATEWAY_RETRY_DELAY_MS',
      250,
      0,
      5_000,
    );
  }

  private gatewayBackoff(): 'constant' | 'linear' | 'exponential' {
    const value = this.configService
      .get<string>('CLOUDFLARE_AI_GATEWAY_BACKOFF')
      ?.trim()
      .toLowerCase();
    return value === 'constant' || value === 'linear' || value === 'exponential'
      ? value
      : 'exponential';
  }

  private integerConfig(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
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
