import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmService } from '../../domain/interfaces/llm.service.interface';
import type { CloudflareChatEndpoint } from './cloudflare-workers-ai-text.client';
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
    const primary = this.getPrimaryConfig();

    this.logger.debug(
      [
        `Generating Cloudflare chat response for User [${userId}]`,
        `model=${primary.model}`,
        `endpoint=${primary.endpoint}`,
        `timeoutMs=${primary.timeoutMs}`,
        `systemChars=${systemInstruction.length}`,
        `userChars=${userMessage.length}`,
      ].join(' '),
    );

    const messages = [
      {
        role: 'system' as const,
        content: this.buildSystemMessage(systemInstruction),
      },
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    try {
      let emittedStreamToken = false;

      const response = await this.cloudflareTextClient.generateChatText({
        model: primary.model,
        endpoint: primary.endpoint,
        timeoutMs: primary.timeoutMs,
        maxTokens: primary.maxTokens,
        temperature: primary.temperature,
        onToken: (token: string) => {
          emittedStreamToken = true;
          onToken(token);
        },
        messages,
      });

      const finalAnswer = this.cleanAssistantResponse(response);

      if (finalAnswer.length === 0) {
        throw new Error('Cloudflare primary model returned empty answer.');
      }

      if (!emittedStreamToken) {
        onToken(finalAnswer);
      }

      return finalAnswer;
    } catch (primaryError: unknown) {
      const primaryMessage =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);

      this.logger.warn(`primary chat model failed: ${primaryMessage}`);

      const fallback = this.getFallbackConfig();

      if (!fallback) {
        return this.publishProviderFailure(onToken, primaryMessage);
      }

      this.logger.warn(
        [
          'trying fallback chat model',
          `model=${fallback.model}`,
          `endpoint=${fallback.endpoint}`,
          `timeoutMs=${fallback.timeoutMs}`,
        ].join(' '),
      );

      try {
        const fallbackAnswer = await this.cloudflareTextClient.generateChatText(
          {
            model: fallback.model,
            endpoint: fallback.endpoint,
            timeoutMs: fallback.timeoutMs,
            maxTokens: fallback.maxTokens,
            temperature: fallback.temperature,
            messages,
          },
        );

        const finalFallbackAnswer = this.cleanAssistantResponse(fallbackAnswer);

        if (finalFallbackAnswer.length === 0) {
          throw new Error('Cloudflare fallback model returned empty answer.');
        }

        onToken(finalFallbackAnswer);

        return finalFallbackAnswer;
      } catch (fallbackError: unknown) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);

        this.logger.warn(`fallback chat model failed: ${fallbackMessage}`);

        return this.publishProviderFailure(onToken, fallbackMessage);
      }
    }
  }

  private buildSystemMessage(systemInstruction: string): string {
    return [
      systemInstruction,
      '',
      'Important response rules:',
      '- Answer the user directly.',
      '- Be concise.',
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

  private publishProviderFailure(
    onToken: (token: string) => void,
    reason: string,
  ): string {
    this.logger.warn(`fallback answer used: ${reason}`);

    const fallback =
      'I could not generate the answer right now because the AI provider returned an empty or failed response. Please try again.';

    onToken(fallback);

    return fallback;
  }

  private getPrimaryConfig(): {
    model: string;
    endpoint: CloudflareChatEndpoint;
    timeoutMs: number;
    maxTokens: number;
    temperature: number;
  } {
    return {
      model:
        this.configService.get<string>('CLOUDFLARE_CHAT_MODEL') ||
        '@cf/zai-org/glm-4.7-flash',
      endpoint: this.getEndpoint('CLOUDFLARE_CHAT_ENDPOINT', 'chat_stream'),
      timeoutMs: this.getPositiveNumber('CLOUDFLARE_CHAT_TIMEOUT_MS', 12000),
      maxTokens: this.getPositiveNumber('CLOUDFLARE_CHAT_MAX_TOKENS', 500),
      temperature: this.getTemperature('CLOUDFLARE_CHAT_TEMPERATURE', 0.2),
    };
  }

  private getFallbackConfig(): {
    model: string;
    endpoint: CloudflareChatEndpoint;
    timeoutMs: number;
    maxTokens: number;
    temperature: number;
  } | null {
    const enabled = this.getBoolean('CLOUDFLARE_CHAT_FALLBACK_ENABLED', true);

    if (!enabled) {
      return null;
    }

    return {
      model:
        this.configService.get<string>('CLOUDFLARE_CHAT_FALLBACK_MODEL') ||
        this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
        '@cf/meta/llama-3.1-8b-instruct-fast',
      endpoint: this.getEndpoint(
        'CLOUDFLARE_CHAT_FALLBACK_ENDPOINT',
        'chat_completions',
      ),
      timeoutMs: this.getPositiveNumber(
        'CLOUDFLARE_CHAT_FALLBACK_TIMEOUT_MS',
        15000,
      ),
      maxTokens: this.getPositiveNumber(
        'CLOUDFLARE_CHAT_FALLBACK_MAX_TOKENS',
        450,
      ),
      temperature: this.getTemperature(
        'CLOUDFLARE_CHAT_FALLBACK_TEMPERATURE',
        0.2,
      ),
    };
  }

  private cleanAssistantResponse(value: string): string {
    return value
      .replace(/^assistant\s*:/i, '')
      .replace(/^answer\s*:/i, '')
      .replace(/^final\s*:/i, '')
      .trim();
  }

  private getEndpoint(
    key: string,
    fallback: CloudflareChatEndpoint,
  ): CloudflareChatEndpoint {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (value === 'run') {
      return 'run';
    }

    if (value === 'run_stream') {
      return 'run_stream';
    }

    if (value === 'chat_stream') {
      return 'chat_stream';
    }

    if (value === 'chat_completions') {
      return 'chat_completions';
    }

    return fallback;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return fallback;
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getTemperature(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(value, 0), 1);
  }
}
