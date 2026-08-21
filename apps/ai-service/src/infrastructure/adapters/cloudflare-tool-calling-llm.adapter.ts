import type {
  IToolCallingLlmService,
  LlmToolCall,
  ToolCallingCompletionInput,
  ToolCallingCompletionResult,
  ToolCallingMessage,
} from '@ai/domain/interfaces/tool-calling-llm.service.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

interface CloudflareToolCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: CloudflareToolCall[];
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
export class CloudflareToolCallingLlmAdapter implements IToolCallingLlmService {
  private readonly logger = new Logger(CloudflareToolCallingLlmAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async complete(
    input: ToolCallingCompletionInput,
  ): Promise<ToolCallingCompletionResult> {
    const accountId = this.config.getOrThrow<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = this.config.getOrThrow<string>('CLOUDFLARE_API_TOKEN');
    const model =
      input.model ||
      this.config.get<string>('CLOUDFLARE_TOOL_MODEL') ||
      '@cf/openai/gpt-oss-20b';
    const timeoutMs = this.resolveTimeout(input.timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: input.messages.map((message) =>
              this.toProviderMessage(message),
            ),
            tools: input.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: input.toolChoice ?? 'auto',
            parallel_tool_calls: true,
            max_completion_tokens: input.maxTokens ?? 600,
            temperature: input.temperature ?? 0.1,
            stream: false,
          }),
          signal: controller.signal,
        },
      );
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw new Error(
          `Cloudflare tool-calling request timed out after ${timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const json = (await response.json()) as CloudflareToolCompletionResponse;
    if (!response.ok) {
      const message =
        json.error?.message ||
        json.errors
          ?.map((item) => item.message)
          .filter((item): item is string => Boolean(item))
          .join(', ') ||
        `Cloudflare tool-calling request failed with status ${response.status}`;
      this.logger.warn(message);
      throw new Error(message);
    }

    const choice = json.choices?.[0];
    const message = choice?.message;
    if (!message) {
      throw new Error('Cloudflare tool-calling response contained no message');
    }

    return {
      content: message.content?.trim() || undefined,
      toolCalls: (message.tool_calls ?? [])
        .map((call, index) => this.parseToolCall(call, index))
        .filter((call): call is LlmToolCall => Boolean(call)),
      finishReason: choice?.finish_reason ?? undefined,
    };
  }

  private toProviderMessage(
    message: ToolCallingMessage,
  ): Record<string, unknown> {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content ?? null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            }
          : {}),
      };
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  }

  private parseToolCall(
    call: CloudflareToolCall,
    index: number,
  ): LlmToolCall | null {
    const name = call.function?.name?.trim();
    if (!name) return null;

    return {
      id: call.id?.trim() || `tool-call-${index}`,
      name,
      arguments: this.parseArguments(call.function?.arguments),
    };
  }

  private parseArguments(
    value: string | Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      this.logger.warn('Ignoring invalid JSON tool-call arguments');
      return {};
    }
  }

  private resolveTimeout(requestTimeoutMs?: number): number {
    const configured = Number(
      this.config.get<string>('CLOUDFLARE_TOOL_TIMEOUT_MS') ?? '10000',
    );
    const fallback = Number.isFinite(configured) ? configured : 10_000;
    const requested = Number(requestTimeoutMs ?? fallback);
    return Number.isFinite(requested)
      ? Math.min(30_000, Math.max(1_000, Math.round(requested)))
      : 10_000;
  }
}
