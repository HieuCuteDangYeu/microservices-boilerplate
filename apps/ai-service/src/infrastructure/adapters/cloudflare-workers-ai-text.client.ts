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
  choices?: Array<{
    message?: {
      content?: string;
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

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
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

        const json =
          (await response.json()) as CloudflareChatCompletionResponse;

        if (!response.ok) {
          const message =
            json.error?.message ||
            json.errors
              ?.map((error) => error.message)
              .filter(Boolean)
              .join(', ') ||
            `Cloudflare chat completion failed with status ${response.status}`;

          throw new Error(message);
        }

        return json.choices?.[0]?.message?.content?.trim() ?? '';
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `[CloudflareChat] attempt=${attempt}/${maxAttempts} failed: ${message}`,
        );

        if (attempt === maxAttempts) {
          throw error;
        }

        await this.sleep(300 * attempt);
      }
    }

    return '';
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
