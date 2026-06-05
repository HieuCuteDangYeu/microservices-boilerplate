import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareAiResponse {
  success: boolean;
  result?: {
    response?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
}

@Injectable()
export class CloudflareWorkersAiTextClient {
  private readonly logger = new Logger(CloudflareWorkersAiTextClient.name);

  constructor(private readonly configService: ConfigService) {}

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

    const json = (await response.json()) as CloudflareAiResponse;

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
}
