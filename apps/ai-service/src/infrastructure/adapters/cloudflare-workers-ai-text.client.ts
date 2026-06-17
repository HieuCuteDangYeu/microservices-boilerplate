import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareAiRunResponse {
  success: boolean;
  result?: {
    response?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

interface CloudflareChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CloudflareChatCompletionResponse {
  success?: boolean;
  result?: {
    response?: string;
    text?: string;
  };
  response?: string;
  output?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  error?: {
    message?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

@Injectable()
export class CloudflareWorkersAiTextClient {
  private readonly logger = new Logger(CloudflareWorkersAiTextClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Use this for simple single-prompt background tasks:
   * - memory extraction
   * - conversation summarization
   *
   * Do not use this for the chatbot answer, because chat models behave better
   * with role-based messages.
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

    if (!response.ok || !json.success) {
      const message =
        json.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join(', ') ||
        `Cloudflare Workers AI request failed with status ${response.status}`;

      this.logger.warn(message);
      throw new Error(message);
    }

    return json.result?.response?.trim() ?? '';
  }

  /**
   * Use this for chatbot replies.
   *
   * This calls Cloudflare's OpenAI-compatible chat completions endpoint,
   * so the model receives proper system/user roles instead of one flat prompt.
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
        temperature: input.temperature ?? 0.3,
      }),
    });

    const json = (await response.json()) as CloudflareChatCompletionResponse;

    if (!response.ok || json.success === false) {
      const message = this.extractErrorMessage(
        json,
        `Cloudflare chat completion failed with status ${response.status}`,
      );

      this.logger.warn(message);
      throw new Error(message);
    }

    const content = this.extractChatCompletionText(json);

    if (!content) {
      this.logger.warn(
        `[CloudflareChat] empty response shape=${this.describeResponseShape(
          json,
        )}`,
      );

      throw new Error('Cloudflare chat completion returned empty answer.');
    }

    return content;
  }

  private extractChatCompletionText(
    json: CloudflareChatCompletionResponse,
  ): string {
    const openAiContent = json.choices?.[0]?.message?.content?.trim();

    if (openAiContent) {
      return openAiContent;
    }

    const choiceText = json.choices?.[0]?.text?.trim();

    if (choiceText) {
      return choiceText;
    }

    const resultResponse = json.result?.response?.trim();

    if (resultResponse) {
      return resultResponse;
    }

    const resultText = json.result?.text?.trim();

    if (resultText) {
      return resultText;
    }

    const directResponse = json.response?.trim();

    if (directResponse) {
      return directResponse;
    }

    const directOutput = json.output?.trim();

    if (directOutput) {
      return directOutput;
    }

    return '';
  }

  private extractErrorMessage(
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

  private describeResponseShape(
    json: CloudflareChatCompletionResponse,
  ): string {
    return JSON.stringify({
      success: json.success,
      hasResult: Boolean(json.result),
      hasResultResponse: Boolean(json.result?.response),
      hasResultText: Boolean(json.result?.text),
      hasChoices: Boolean(json.choices?.length),
      hasChoiceMessageContent: Boolean(json.choices?.[0]?.message?.content),
      hasChoiceText: Boolean(json.choices?.[0]?.text),
      hasDirectResponse: Boolean(json.response),
      hasDirectOutput: Boolean(json.output),
      hasError: Boolean(json.error),
      errorCount: json.errors?.length ?? 0,
    });
  }
}
