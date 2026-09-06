import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { ILlmService } from '@ai/domain/interfaces/llm.service.interface';
import { GroqTextClient } from './groq-text.client';

@Injectable()
export class GroqLlmAdapter implements ILlmService {
  private readonly logger = new Logger(GroqLlmAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly textClient: GroqTextClient,
  ) {}

  async generateResponseStream(
    userMessage: string,
    systemInstruction: string,
    userId: string,
    onToken: (token: string) => void,
    sessionAffinityKey?: string,
  ): Promise<string> {
    const model = this.config.getOrThrow<string>('AI_ANSWER_MODEL');
    this.logger.debug(
      `Generating Groq response for user=${userId} model=${model} session=${createHash(
        'sha256',
      )
        .update(sessionAffinityKey || userId)
        .digest('hex')
        .slice(0, 12)}`,
    );
    try {
      const response = await this.textClient.generateChatText({
        model,
        messages: [
          {
            role: 'system',
            content: this.buildSystemMessage(systemInstruction),
          },
          { role: 'user', content: userMessage },
        ],
        maxTokens: this.number('AI_ANSWER_MAX_TOKENS', 1536),
        temperature: this.number('GROQ_CHAT_TEMPERATURE', 0.2, 0, 1),
        timeoutMs: this.number('AI_ANSWER_TIMEOUT_MS', 45_000, 500, 120_000),
        onToken,
      });
      return this.clean(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Groq answer generation failed: ${message}`);
      const fallback =
        'I could not generate the answer right now because the AI provider returned an empty or failed response. Please try again.';
      onToken(fallback);
      return fallback;
    }
  }

  private buildSystemMessage(value: string): string {
    return [
      value,
      '',
      'Important response rules:',
      '- Answer the user directly.',
      '- Be concise.',
      '- Do not output hidden reasoning.',
      '- Do not output analysis.',
      '- Do not call tools.',
      '- Do not return an empty response.',
      '- Return only the assistant reply.',
    ].join('\n');
  }

  private clean(value: string): string {
    return value
      .replace(/^assistant\s*:/i, '')
      .replace(/^answer\s*:/i, '')
      .replace(/^final\s*:/i, '')
      .trim();
  }

  private number(
    key: string,
    fallback: number,
    min = 1,
    max = 120_000,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
  }
}
