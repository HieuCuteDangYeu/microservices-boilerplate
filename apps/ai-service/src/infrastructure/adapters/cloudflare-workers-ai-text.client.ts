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
    content?: string | null;
    reasoning_content?: string | null;
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

type CloudflareChatEndpoint = 'chat_completions' | 'run';

@Injectable()
export class CloudflareWorkersAiTextClient {
  private readonly logger = new Logger(CloudflareWorkersAiTextClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Use this for simple single-prompt background tasks:
   * - memory extraction
   * - conversation summarization
   */
  async generateText(input: {
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );

    const apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );

    const model =
      input.model ||
      this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
      '@cf/meta/llama-3.2-1b-instruct';

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        max_tokens: input.maxTokens ?? 512,
      }),
    });

    const json = (await response.json()) as CloudflareAiRunResponse;

    if (!response.ok || json.success === false) {
      const message =
        json.errors
          ?.map((error) => error.message)
          .filter((item): item is string => Boolean(item))
          .join(', ') ||
        `Cloudflare Workers AI request failed with status ${response.status}`;

      this.logger.warn(message);
      throw new Error(message);
    }

    const text = this.extractRunText(json);

    if (!text) {
      this.logger.warn(
        `[CloudflareRunText] empty response shape=${this.describeRunResponseShape(
          json,
        )}`,
      );

      throw new Error('Cloudflare Workers AI run returned empty text.');
    }

    return text;
  }

  /**
   * Use this for chatbot replies.
   *
   * Default behavior:
   * - Use OpenAI-compatible chat completions first.
   * - If Cloudflare returns an empty choice, fallback to /ai/run/{model}.
   *
   * To skip chat completions for GLM and use /ai/run directly:
   * CLOUDFLARE_CHAT_ENDPOINT=run
   */
  async generateChatText(input: {
    model: string;
    messages: CloudflareChatMessage[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );

    const apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );

    const endpoint = this.getChatEndpoint();

    if (endpoint === 'run') {
      return await this.generateRunChatText(input, accountId, apiToken);
    }

    try {
      return await this.generateChatCompletionText(input, accountId, apiToken);
    } catch (error: unknown) {
      if (!this.isEmptyAnswerError(error) || !this.shouldFallbackToRun()) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[CloudflareChat] chat-completions returned empty answer, retrying with /ai/run: ${message}`,
      );

      return await this.generateRunChatText(input, accountId, apiToken);
    }
  }

  private async generateChatCompletionText(
    input: {
      model: string;
      messages: CloudflareChatMessage[];
      maxTokens?: number;
      temperature?: number;
    },
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? 700,
        temperature: input.temperature ?? 0.2,
        stream: false,
      }),
    });

    const json = (await response.json()) as CloudflareChatCompletionResponse;

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
  }

  private async generateRunChatText(
    input: {
      model: string;
      messages: CloudflareChatMessage[];
      maxTokens?: number;
      temperature?: number;
    },
    accountId: string,
    apiToken: string,
  ): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${input.model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: input.messages,
        max_tokens: input.maxTokens ?? 700,
        temperature: input.temperature ?? 0.2,
      }),
    });

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
        `[CloudflareRunChat] empty response shape=${this.describeRunResponseShape(
          json,
        )}`,
      );

      throw new Error('Cloudflare Workers AI run returned empty answer.');
    }

    return text;
  }

  private extractChatCompletionText(
    json: CloudflareChatCompletionResponse,
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

  private getChatEndpoint(): CloudflareChatEndpoint {
    const value = this.configService
      .get<string>('CLOUDFLARE_CHAT_ENDPOINT')
      ?.trim()
      .toLowerCase();

    return value === 'run' ? 'run' : 'chat_completions';
  }

  private shouldFallbackToRun(): boolean {
    const value = this.configService
      .get<string>('CLOUDFLARE_CHAT_FALLBACK_TO_RUN')
      ?.trim()
      .toLowerCase();

    return value !== 'false';
  }

  private isEmptyAnswerError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    return message.toLowerCase().includes('empty answer');
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

      hasReasoningContent: Boolean(message?.reasoning_content),
      reasoningContentLength:
        typeof message?.reasoning_content === 'string'
          ? message.reasoning_content.length
          : 0,

      hasRefusal: Boolean(message?.refusal),
      hasToolCalls: Boolean(message?.tool_calls),

      hasDelta: Boolean(delta),
      deltaKeys: delta ? Object.keys(delta) : [],
      deltaContentLength:
        typeof delta?.content === 'string' ? delta.content.length : 0,
      deltaReasoningContentLength:
        typeof delta?.reasoning_content === 'string'
          ? delta.reasoning_content.length
          : 0,

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
}
