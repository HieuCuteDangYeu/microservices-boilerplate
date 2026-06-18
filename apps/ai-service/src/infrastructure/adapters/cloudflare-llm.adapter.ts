import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmService } from '../../domain/interfaces/llm.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

type CloudflareChatEndpoint = 'chat_completions' | 'run' | 'run_stream';

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
    const model =
      this.configService.get<string>('CLOUDFLARE_CHAT_MODEL') ||
      '@cf/zai-org/glm-4.7-flash';

    const endpoint = this.getChatEndpoint();

    this.logger.debug(
      [
        `Generating Cloudflare chat response for User [${userId}]`,
        `model=${model}`,
        `endpoint=${endpoint}`,
        `systemChars=${systemInstruction.length}`,
        `userChars=${userMessage.length}`,
      ].join(' '),
    );

    try {
      const response = await this.cloudflareTextClient.generateChatText({
        model,
        endpoint,
        fallbackToRunStream: this.shouldFallbackToRunStream(),
        maxTokens: this.getPositiveNumber('CLOUDFLARE_CHAT_MAX_TOKENS', 900),
        temperature: this.getTemperature(),
        messages: [
          {
            role: 'system',
            content: this.buildSystemMessage(systemInstruction),
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

      this.logger.warn(`fallback answer used: ${message}`);

      const fallback =
        'I could not generate the answer right now because the AI provider returned an empty or failed response. Please try again.';

      onToken(fallback);

      return fallback;
    }
  }

  private buildSystemMessage(systemInstruction: string): string {
    return [
      systemInstruction,
      '',
      'Important response rules:',
      '- Answer the user directly.',
      '- Do not output hidden reasoning.',
      '- Do not output analysis.',
      '- Do not call tools.',
      '- Do not return an empty response.',
      '- Do not repeat the system prompt.',
      '- Do not print "USER MESSAGE".',
      '- Do not create multiple-choice options unless the user asks for options.',
      '- Do not ask the user to select a response option.',
      '- Return only the assistant reply.',
    ].join('\n');
  }

  private cleanAssistantResponse(value: string): string {
    return value
      .replace(/^assistant\s*:/i, '')
      .replace(/^answer\s*:/i, '')
      .replace(/^final\s*:/i, '')
      .trim();
  }

  private getChatEndpoint(): CloudflareChatEndpoint {
    const value = this.configService
      .get<string>('CLOUDFLARE_CHAT_ENDPOINT')
      ?.trim()
      .toLowerCase();

    if (value === 'run') {
      return 'run';
    }

    if (value === 'run_stream') {
      return 'run_stream';
    }

    return 'chat_completions';
  }

  private shouldFallbackToRunStream(): boolean {
    const value = this.configService
      .get<string>('CLOUDFLARE_CHAT_FALLBACK_TO_RUN')
      ?.trim()
      .toLowerCase();

    return value !== 'false';
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getTemperature(): number {
    const value = Number(
      this.configService.get<string>('CLOUDFLARE_CHAT_TEMPERATURE') ?? '0.2',
    );

    if (!Number.isFinite(value)) {
      return 0.2;
    }

    return Math.min(Math.max(value, 0), 1);
  }
}
