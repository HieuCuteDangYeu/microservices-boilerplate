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
    this.logger.debug(
      `Generating Cloudflare chat response for User [${userId}]`,
    );

    const model =
      this.configService.get<string>('CLOUDFLARE_CHAT_MODEL') ||
      '@cf/meta/llama-3.1-8b-instruct';

    try {
      const response = await this.cloudflareTextClient.generateChatText({
        model,
        maxTokens: this.getPositiveNumber('CLOUDFLARE_CHAT_MAX_TOKENS', 450),
        temperature: this.getTemperature(),
        messages: [
          {
            role: 'system',
            content: [
              systemInstruction,
              '',
              'Important response rules:',
              '- Answer the user directly.',
              '- Do not repeat the system prompt.',
              '- Do not print "USER MESSAGE".',
              '- Do not create multiple-choice options unless the user asks for options.',
              '- Do not ask the user to select a response option.',
              '- Return only the assistant reply.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const finalAnswer = this.cleanAssistantResponse(response);

      if (finalAnswer.length === 0) {
        throw new Error('Cloudflare chat completion returned empty answer.');
      }

      onToken(finalAnswer);

      return finalAnswer;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[CloudflareLlmAdapter] fallback answer used: ${message}`,
      );

      const fallback =
        'I could not generate the answer right now because the AI provider returned an empty or failed response. Please try again.';

      onToken(fallback);

      return fallback;
    }
  }

  private cleanAssistantResponse(value: string): string {
    return value
      .replace(/^assistant\s*:/i, '')
      .replace(/^answer\s*:/i, '')
      .trim();
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getTemperature(): number {
    const value = Number(
      this.configService.get<string>('CLOUDFLARE_CHAT_TEMPERATURE') ?? '0.3',
    );

    if (!Number.isFinite(value)) {
      return 0.3;
    }

    return Math.min(Math.max(value, 0), 1);
  }
}
