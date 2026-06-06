import type { AiChatMessageContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { Injectable, Logger } from '@nestjs/common';
import type {
  IConversationSummarizerService,
  SummarizeConversationTurnInput,
  SummarizeConversationTurnResult,
} from '../../domain/interfaces/conversation-summarizer.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

interface StructuredConversationSummary {
  currentGoal?: string;
  implemented?: string[];
  decisions?: string[];
  openIssues?: string[];
  nextSteps?: string[];
  constraints?: string[];
}

@Injectable()
export class CloudflareConversationSummarizerAdapter implements IConversationSummarizerService {
  private readonly logger = new Logger(
    CloudflareConversationSummarizerAdapter.name,
  );

  constructor(
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async summarizeTurn(
    input: SummarizeConversationTurnInput,
  ): Promise<SummarizeConversationTurnResult> {
    const prompt = this.buildPrompt(input);

    try {
      const response = await this.cloudflareTextClient.generateText({
        prompt,
        maxTokens: 700,
      });

      const structured = this.parseStructuredSummary(response);
      const rendered = this.renderSummary(structured);

      if (!rendered) {
        return {
          summary: input.existingSummary?.trim() || '',
        };
      }

      return {
        summary: this.truncate(rendered, 1200),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Cloudflare conversation summarization failed: ${message}`,
      );

      return {
        summary: input.existingSummary?.trim() || '',
      };
    }
  }

  private buildPrompt(input: SummarizeConversationTurnInput): string {
    return `
You update a rolling technical memory for one chat conversation.

The output will be stored and reused as conversation memory.

Task:
Extract only concrete, reusable technical context from the provided conversation data.

Return strict JSON only with this shape:
{
  "currentGoal": "string or empty string",
  "implemented": ["concrete completed work"],
  "decisions": ["technical or architecture decision"],
  "openIssues": ["unresolved issue or bug"],
  "nextSteps": ["planned next action"],
  "constraints": ["important rule or constraint"]
}

Rules:
1. Do not return markdown.
2. Do not return prose outside JSON.
3. Do not copy every message.
4. Do not include motivational or vague progress statements.
5. Do not include secrets, credentials, tokens, or private sensitive information.
6. Only include information that would help future responses in this same conversation.
7. Prefer concrete actions, components, files, services, architecture rules, bugs, fixes, and next steps.
8. If a category has no useful information, return an empty array or empty string.
9. Use the existing summary as prior memory and update it with recent chat history and the latest turn.
10. If new information corrects older information, keep the newer information.

Existing summary:
<existing_summary>
${input.existingSummary?.trim() || ''}
</existing_summary>

Recent chat history:
<recent_chat_history>
${this.formatRecentMessages(input.recentMessages)}
</recent_chat_history>

Latest user message:
<latest_user_message>
${input.userMessage}
</latest_user_message>

Latest assistant answer:
<latest_assistant_answer>
${input.assistantMessage}
</latest_assistant_answer>
`.trim();
  }

  private parseStructuredSummary(text: string): StructuredConversationSummary {
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as StructuredConversationSummary;

    return {
      currentGoal: this.cleanText(parsed.currentGoal),
      implemented: this.cleanList(parsed.implemented),
      decisions: this.cleanList(parsed.decisions),
      openIssues: this.cleanList(parsed.openIssues),
      nextSteps: this.cleanList(parsed.nextSteps),
      constraints: this.cleanList(parsed.constraints),
    };
  }

  private renderSummary(summary: StructuredConversationSummary): string {
    const sections = [
      summary.currentGoal ? `Current goal: ${summary.currentGoal}` : undefined,
      this.renderList('Implemented', summary.implemented),
      this.renderList('Decisions', summary.decisions),
      this.renderList('Open issues', summary.openIssues),
      this.renderList('Next steps', summary.nextSteps),
      this.renderList('Constraints', summary.constraints),
    ].filter((section): section is string => Boolean(section));

    return sections.join('\n');
  }

  private renderList(label: string, values?: string[]): string | undefined {
    const items = this.cleanList(values);

    if (items.length === 0) {
      return undefined;
    }

    return `${label}: ${items.join('; ')}`;
  }

  private cleanList(values?: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => this.cleanText(value))
      .filter((value): value is string => Boolean(value));
  }

  private cleanText(value?: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const cleaned = value.replace(/\s+/g, ' ').trim();

    return cleaned.length > 0 ? cleaned : undefined;
  }

  private formatRecentMessages(messages?: AiChatMessageContext[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    return messages
      .map((message) => {
        const role = message.role === 'assistant' ? 'ASSISTANT' : 'USER';
        return `${role}: ${message.content}`;
      })
      .join('\n');
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trim()}...`;
  }
}
