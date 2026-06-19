import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareAiRunResponse {
  success?: boolean;
  result?: {
    response?: string;
    text?: string;
  };
  response?: string;
  output?: string;
  errors?: Array<{
    message?: string;
  }>;
}

interface CloudflareChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type CloudflareMessageContent =
  | string
  | null
  | Array<{
      type?: string;
      text?: string;
    }>;

interface CloudflareChatCompletionChoice {
  index?: number;
  finish_reason?: string | null;
  text?: string | null;
  message?: {
    role?: string;
    content?: CloudflareMessageContent;
    reasoning_content?: string | null;
    refusal?: string | null;
    tool_calls?: unknown;
  };
  delta?: {
    role?: string;
    content?: string | null;
    reasoning_content?: string | null;
    refusal?: string | null;
    tool_calls?: unknown;
  };
}

interface CloudflareChatCompletionResponse {
  success?: boolean;
  result?: {
    response?: string;
    text?: string;
  };
  response?: string;
  output?: string;
  choices?: CloudflareChatCompletionChoice[];
  error?: {
    message?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

interface CloudflareStreamEvent {
  success?: boolean;
  response?: string;
  text?: string;
  output?: string;
  result?: {
    response?: string;
    text?: string;
  };
  choices?: CloudflareChatCompletionChoice[];
  error?: {
    message?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

export type CloudflareChatEndpoint =
  | 'chat_completions'
  | 'chat_stream'
  | 'run'
  | 'run_stream';

type ChatRequestInput = {
  model: string;
  messages: CloudflareChatMessage[];
  maxTokens?: number;
  temperature?: number;
  endpoint?: CloudflareChatEndpoint;
  timeoutMs?: number;
  onToken?: (token: string) => void;
};

@Injectable()
export class CloudflareWorkersAiTextClient {
  private readonly logger = new Logger(CloudflareWorkersAiTextClient.name);

  constructor(private readonly configService: ConfigService) {}

  async generateText(input: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    endpoint?: CloudflareChatEndpoint;
    timeoutMs?: number;
  }): Promise<string> {
    const model =
      input.model ||
      this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
      '@cf/meta/llama-3.1-8b-instruct-fast';

    return await this.generateChatText({
      model,
      endpoint: input.endpoint ?? 'chat_completions',
      timeoutMs: input.timeoutMs,
      maxTokens: input.maxTokens ?? 512,
      temperature: input.temperature ?? 0.1,
      messages: [
        {
          role: 'user',
          content: input.prompt,
        },
      ],
    });
  }

  async generateChatText(input: ChatRequestInput): Promise<string> {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );
    const apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );

    const endpoint = input.endpoint ?? this.getDefaultEndpoint();

    if (endpoint === 'chat_stream') {
      return await this.generateChatCompletionStreamText(
        input,
        accountId,
        apiToken,
      );
    }

    if (endpoint === 'run') {
      return await this.generateRunText(input, accountId, apiToken);
    }

    if (endpoint === 'run_stream') {
      return await this.generateRunStreamText(input, accountId, apiToken);
    }

    return await this.generateChatCompletionText(input, accountId, apiToken);
  }

  private async generateChatCompletionText(
    input: ChatRequestInput,
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    return await this.withTimeout(
      input.timeoutMs ?? this.getDefaultTimeoutMs(),
      async (signal) => {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
          {
            method: 'POST',
            headers: this.buildHeaders(apiToken),
            signal,
            body: JSON.stringify({
              model: input.model,
              messages: input.messages,
              max_completion_tokens: input.maxTokens ?? 450,
              temperature: input.temperature ?? 0.2,
              modalities: ['text'],
              tool_choice: 'none',
              parallel_tool_calls: false,
              reasoning_effort: this.getReasoningEffort(),
              stream: false,
            }),
          },
        );

        const json =
          (await response.json()) as CloudflareChatCompletionResponse;

        if (!response.ok || json.success === false) {
          const message = this.extractChatErrorMessage(
            json,
            `Cloudflare chat completion failed with status ${response.status}`,
          );

          this.logger.warn(message);
          throw new Error(message);
        }

        const content = this.extractChatCompletionText(json);

        if (!content) {
          this.logger.warn(
            `[CloudflareChat] empty response shape=${this.describeChatResponseShape(
              json,
            )}`,
          );

          throw new Error('Cloudflare chat completion returned empty answer.');
        }

        return content;
      },
    );
  }

  private async generateChatCompletionStreamText(
    input: ChatRequestInput,
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    return await this.withTimeout(
      input.timeoutMs ?? this.getDefaultTimeoutMs(),
      async (signal) => {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
          {
            method: 'POST',
            headers: this.buildHeaders(apiToken),
            signal,
            body: JSON.stringify({
              model: input.model,
              messages: input.messages,
              max_completion_tokens: input.maxTokens ?? 450,
              temperature: input.temperature ?? 0.2,
              modalities: ['text'],
              tool_choice: 'none',
              parallel_tool_calls: false,
              reasoning_effort: this.getReasoningEffort(),
              stream: true,
            }),
          },
        );

        return await this.readStreamResponse(
          response,
          'CloudflareChatCompletionStream',
          input.onToken,
        );
      },
    );
  }

  private async generateRunText(
    input: ChatRequestInput,
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    return await this.withTimeout(
      input.timeoutMs ?? this.getDefaultTimeoutMs(),
      async (signal) => {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${input.model}`,
          {
            method: 'POST',
            headers: this.buildHeaders(apiToken),
            signal,
            body: JSON.stringify({
              messages: input.messages,
              max_completion_tokens: input.maxTokens ?? 450,
              temperature: input.temperature ?? 0.2,
              modalities: ['text'],
              tool_choice: 'none',
              parallel_tool_calls: false,
              reasoning_effort: this.getReasoningEffort(),
              stream: false,
            }),
          },
        );

        const json = (await response.json()) as CloudflareAiRunResponse;

        if (!response.ok || json.success === false) {
          const message =
            json.errors
              ?.map((error) => error.message)
              .filter((item): item is string => Boolean(item))
              .join(', ') ||
            `Cloudflare Workers AI run request failed with status ${response.status}`;

          this.logger.warn(message);
          throw new Error(message);
        }

        const text = this.extractRunText(json);

        if (!text) {
          this.logger.warn(
            `[CloudflareRun] empty response shape=${this.describeRunResponseShape(
              json,
            )}`,
          );

          throw new Error('Cloudflare Workers AI run returned empty answer.');
        }

        return text;
      },
    );
  }

  private async generateRunStreamText(
    input: ChatRequestInput,
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    return await this.withTimeout(
      input.timeoutMs ?? this.getDefaultTimeoutMs(),
      async (signal) => {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${input.model}`,
          {
            method: 'POST',
            headers: this.buildHeaders(apiToken),
            signal,
            body: JSON.stringify({
              messages: input.messages,
              max_completion_tokens: input.maxTokens ?? 450,
              temperature: input.temperature ?? 0.2,
              modalities: ['text'],
              tool_choice: 'none',
              parallel_tool_calls: false,
              reasoning_effort: this.getReasoningEffort(),
              stream: true,
            }),
          },
        );

        return await this.readStreamResponse(
          response,
          'CloudflareRunStream',
          input.onToken,
        );
      },
    );
  }

  private async readStreamResponse(
    response: Response,
    logPrefix: string,
    onToken?: (token: string) => void,
  ): Promise<string> {
    if (!response.ok) {
      const errorText = await response.text();

      this.logger.warn(
        `[${logPrefix}] request failed status=${response.status} body=${this.truncate(
          errorText,
          500,
        )}`,
      );

      throw new Error(
        `Cloudflare Workers AI stream request failed with status ${response.status}`,
      );
    }

    if (!response.body) {
      throw new Error('Cloudflare Workers AI stream response body is empty.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const outputParts: string[] = [];
    const shapeSamples: string[] = [];

    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line || line.startsWith(':') || !line.startsWith('data:')) {
          continue;
        }

        const payload = line.slice('data:'.length).trim();

        if (!payload || payload === '[DONE]') {
          continue;
        }

        const parsed = this.parseStreamPayload(payload);

        if (!parsed) {
          continue;
        }

        const errorMessage = this.extractStreamErrorMessage(parsed);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        const token = this.extractStreamEventToken(parsed);

        if (token.length > 0) {
          outputParts.push(token);
          onToken?.(token);
          continue;
        }

        if (shapeSamples.length < 3) {
          shapeSamples.push(this.describeStreamEventShape(parsed));
        }
      }
    }

    const finalText = outputParts.join('').trim();

    if (!finalText) {
      this.logger.warn(
        `[${logPrefix}] empty stream response shapes=${JSON.stringify(
          shapeSamples,
        )}`,
      );

      throw new Error('Cloudflare Workers AI stream returned empty answer.');
    }

    return finalText;
  }

  private async withTimeout<T>(
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Cloudflare request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractStreamEventToken(event: CloudflareStreamEvent): string {
    const response = this.readRawText(event.response);

    if (response.length > 0) {
      return response;
    }

    const resultResponse = this.readRawText(event.result?.response);

    if (resultResponse.length > 0) {
      return resultResponse;
    }

    const resultText = this.readRawText(event.result?.text);

    if (resultText.length > 0) {
      return resultText;
    }

    const directText = this.readRawText(event.text);

    if (directText.length > 0) {
      return directText;
    }

    const directOutput = this.readRawText(event.output);

    if (directOutput.length > 0) {
      return directOutput;
    }

    const choice = event.choices?.[0];

    const deltaContent = this.readRawText(choice?.delta?.content);

    if (deltaContent.length > 0) {
      return deltaContent;
    }

    const messageContent = choice?.message?.content;

    if (typeof messageContent === 'string') {
      return messageContent;
    }

    const choiceText = this.readRawText(choice?.text);

    if (choiceText.length > 0) {
      return choiceText;
    }

    return '';
  }

  private readRawText(value: string | null | undefined): string {
    return typeof value === 'string' ? value : '';
  }

  private parseStreamPayload(payload: string): CloudflareStreamEvent | null {
    try {
      return JSON.parse(payload) as CloudflareStreamEvent;
    } catch {
      return null;
    }
  }

  private extractStreamErrorMessage(event: CloudflareStreamEvent): string {
    return (
      event.error?.message ||
      event.errors
        ?.map((error) => error.message)
        .filter((message): message is string => Boolean(message))
        .join(', ') ||
      ''
    );
  }

  private extractChatCompletionText(
    json: CloudflareChatCompletionResponse | CloudflareStreamEvent,
  ): string {
    const choice = json.choices?.[0];

    const messageContent = this.cleanContent(choice?.message?.content);

    if (messageContent) {
      return messageContent;
    }

    const choiceText = this.cleanText(choice?.text);

    if (choiceText) {
      return choiceText;
    }

    const deltaContent = this.cleanText(choice?.delta?.content);

    if (deltaContent) {
      return deltaContent;
    }

    const resultResponse = this.cleanText(json.result?.response);

    if (resultResponse) {
      return resultResponse;
    }

    const resultText = this.cleanText(json.result?.text);

    if (resultText) {
      return resultText;
    }

    const directResponse = this.cleanText(json.response);

    if (directResponse) {
      return directResponse;
    }

    const directOutput = this.cleanText(json.output);

    if (directOutput) {
      return directOutput;
    }

    return '';
  }

  private extractRunText(json: CloudflareAiRunResponse): string {
    const resultResponse = this.cleanText(json.result?.response);

    if (resultResponse) {
      return resultResponse;
    }

    const resultText = this.cleanText(json.result?.text);

    if (resultText) {
      return resultText;
    }

    const directResponse = this.cleanText(json.response);

    if (directResponse) {
      return directResponse;
    }

    const directOutput = this.cleanText(json.output);

    if (directOutput) {
      return directOutput;
    }

    return '';
  }

  private extractChatErrorMessage(
    json: CloudflareChatCompletionResponse,
    fallback: string,
  ): string {
    return (
      json.error?.message ||
      json.errors
        ?.map((error) => error.message)
        .filter((message): message is string => Boolean(message))
        .join(', ') ||
      fallback
    );
  }

  private cleanContent(value: CloudflareMessageContent | undefined): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (!Array.isArray(value)) {
      return '';
    }

    return value
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('\n')
      .trim();
  }

  private cleanText(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private buildHeaders(apiToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private getReasoningEffort(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_CHAT_REASONING_EFFORT') ||
      'low'
    );
  }

  private getDefaultTimeoutMs(): number {
    const value = Number(
      this.configService.get<string>('CLOUDFLARE_CHAT_TIMEOUT_MS') ?? '15000',
    );

    return Number.isFinite(value) && value > 0 ? value : 15000;
  }

  private getDefaultEndpoint(): CloudflareChatEndpoint {
    const value = this.configService
      .get<string>('CLOUDFLARE_CHAT_ENDPOINT')
      ?.trim()
      .toLowerCase();

    if (value === 'chat_stream') {
      return 'chat_stream';
    }

    if (value === 'run') {
      return 'run';
    }

    if (value === 'run_stream') {
      return 'run_stream';
    }

    return 'chat_completions';
  }

  private describeChatResponseShape(
    json: CloudflareChatCompletionResponse,
  ): string {
    const choice = json.choices?.[0];
    const message = choice?.message;
    const delta = choice?.delta;

    return JSON.stringify({
      success: json.success,
      hasResult: Boolean(json.result),
      hasResultResponse: Boolean(json.result?.response),
      resultResponseLength: json.result?.response?.length ?? 0,
      hasResultText: Boolean(json.result?.text),
      resultTextLength: json.result?.text?.length ?? 0,
      hasChoices: Boolean(json.choices?.length),
      choiceCount: json.choices?.length ?? 0,
      choiceKeys: choice ? Object.keys(choice) : [],
      finishReason: choice?.finish_reason ?? null,
      hasMessage: Boolean(message),
      messageKeys: message ? Object.keys(message) : [],
      messageRole: message?.role ?? null,
      contentType: typeof message?.content,
      contentLength:
        typeof message?.content === 'string' ? message.content.length : 0,
      hasDelta: Boolean(delta),
      deltaKeys: delta ? Object.keys(delta) : [],
      deltaContentLength:
        typeof delta?.content === 'string' ? delta.content.length : 0,
      hasChoiceText: Boolean(choice?.text),
      choiceTextLength: choice?.text?.length ?? 0,
      hasDirectResponse: Boolean(json.response),
      directResponseLength: json.response?.length ?? 0,
      hasDirectOutput: Boolean(json.output),
      directOutputLength: json.output?.length ?? 0,
      hasError: Boolean(json.error),
      errorCount: json.errors?.length ?? 0,
    });
  }

  private describeRunResponseShape(json: CloudflareAiRunResponse): string {
    return JSON.stringify({
      success: json.success,
      hasResult: Boolean(json.result),
      hasResultResponse: Boolean(json.result?.response),
      resultResponseLength: json.result?.response?.length ?? 0,
      hasResultText: Boolean(json.result?.text),
      resultTextLength: json.result?.text?.length ?? 0,
      hasDirectResponse: Boolean(json.response),
      directResponseLength: json.response?.length ?? 0,
      hasDirectOutput: Boolean(json.output),
      directOutputLength: json.output?.length ?? 0,
      errorCount: json.errors?.length ?? 0,
    });
  }

  private describeStreamEventShape(event: CloudflareStreamEvent): string {
    const choice = event.choices?.[0];
    const delta = choice?.delta;
    const message = choice?.message;

    return JSON.stringify({
      success: event.success,
      hasResponse: Boolean(event.response),
      responseLength: event.response?.length ?? 0,
      hasText: Boolean(event.text),
      textLength: event.text?.length ?? 0,
      hasOutput: Boolean(event.output),
      outputLength: event.output?.length ?? 0,
      hasResult: Boolean(event.result),
      hasResultResponse: Boolean(event.result?.response),
      resultResponseLength: event.result?.response?.length ?? 0,
      hasChoices: Boolean(event.choices?.length),
      choiceCount: event.choices?.length ?? 0,
      choiceKeys: choice ? Object.keys(choice) : [],
      finishReason: choice?.finish_reason ?? null,
      hasDelta: Boolean(delta),
      deltaKeys: delta ? Object.keys(delta) : [],
      deltaRole: delta?.role ?? null,
      hasDeltaContent: Boolean(delta?.content),
      deltaContentLength: delta?.content?.length ?? 0,
      hasDeltaReasoningContent: Boolean(delta?.reasoning_content),
      deltaReasoningContentLength: delta?.reasoning_content?.length ?? 0,
      hasMessage: Boolean(message),
      hasMessageContent: Boolean(message?.content),
      messageContentType: typeof message?.content,
      messageContentLength:
        typeof message?.content === 'string' ? message.content.length : 0,
      hasError: Boolean(event.error),
      errorCount: event.errors?.length ?? 0,
    });
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trim()}...`;
  }
}
