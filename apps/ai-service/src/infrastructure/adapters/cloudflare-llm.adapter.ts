import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmService } from '../../domain/interfaces/llm.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

@Injectable()
export class CloudflareLlmAdapter implements ILlmService {
  private readonly logger = new Logger(CloudflareLlmAdapter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async generateResponseStream(
    userMessage: string,
    systemInstruction: string,
    userId: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    this.logger.debug(`Generating Cloudflare response for User [${userId}]`);

    const model =
      this.configService.get<string>('CLOUDFLARE_CHAT_MODEL') ||
      this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
      '@cf/meta/llama-3.2-3b-instruct';

    const prompt = `
${systemInstruction}

USER MESSAGE:
${userMessage}
`.trim();

    const response = await this.cloudflareTextClient.generateText({
      prompt,
      model,
      maxTokens: this.getPositiveNumber('CLOUDFLARE_CHAT_MAX_TOKENS', 700),
    });

    const finalAnswer = response.trim();

    if (finalAnswer.length > 0) {
      onToken(finalAnswer);
    }

    return finalAnswer;
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
