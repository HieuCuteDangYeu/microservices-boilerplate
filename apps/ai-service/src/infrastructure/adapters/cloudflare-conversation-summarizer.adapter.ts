import type { AiChatMessageContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { Injectable, Logger } from '@nestjs/common';
import type {
  IConversationSummarizerService,
  SummarizeConversationTurnInput,
  SummarizeConversationTurnResult,
} from '../../domain/interfaces/conversation-summarizer.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

interface StructuredSummaryItem {
  content?: unknown;
  evidence?: unknown;
}

interface RawStructuredConversationSummary {
  currentGoal?: unknown;
  implemented?: unknown;
  decisions?: unknown;
  openIssues?: unknown;
  nextSteps?: unknown;
  constraints?: unknown;
}

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
        maxTokens: 500,
      });

      this.logger.debug(
        `[ConversationSummary] rawResponse=${this.truncate(
          response.replace(/\s+/g, ' '),
          1500,
        )}`,
      );

      const structured = this.tryParseStructuredSummary(response, input);

      this.logStructuredSummaryShape(structured);

      if (!structured) {
        this.logger.warn(
          'Cloudflare summarizer returned invalid structured output; keeping existing summary.',
        );

        return {
          summary: input.existingSummary?.trim() || '',
          shouldUpdate: false,
        };
      }

      if (!this.hasUsefulStructuredContent(structured)) {
        this.logger.warn(
          'Cloudflare summarizer returned structured output without grounded useful memory; keeping existing summary.',
        );

        return {
          summary: input.existingSummary?.trim() || '',
          shouldUpdate: false,
        };
      }

      const rendered = this.renderSummary(structured);

      if (!rendered) {
        return {
          summary: input.existingSummary?.trim() || '',
          shouldUpdate: false,
        };
      }

      return {
        summary: this.truncate(rendered, 1200),
        shouldUpdate: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Cloudflare conversation summarization failed: ${message}`,
      );

      return {
        summary: input.existingSummary?.trim() || '',
        shouldUpdate: false,
      };
    }
  }

  private buildPrompt(input: SummarizeConversationTurnInput): string {
    return `
You are a strict JSON memory updater.

Return exactly one JSON object.
Return no markdown.
Return no explanation.
Return no examples.
Return no JavaScript.
Return no headings.
Return no text before or after the JSON.

Output JSON shape:
{
  "currentGoal": null,
  "implemented": [],
  "decisions": [],
  "openIssues": [],
  "nextSteps": [],
  "constraints": []
}

Each list item must be:
{
  "content": "short memory value",
  "evidence": "exact copied text from the input"
}

Rules:
1. Use only the input below.
2. Do not invent examples.
3. Do not invent user preferences, projects, bugs, tools, decisions, next steps, or constraints.
4. User messages are the source of truth for new memory.
5. Assistant messages are only context for resolving references like "that", "it", or "this feature".
6. Never save assistant offers, assistant explanations, or assistant suggestions unless the user confirms them.
7. Evidence must be exact text copied from the input.
8. Evidence must not be a tag name.
9. Never use evidence like "<latest_user_message>", "<existing_summary>", or "<latest_assistant_context>".
10. Evidence must be a string, not an array.
11. Put completed work only in "implemented".
12. Put active ongoing work only in "currentGoal".
13. Do not put the same memory in multiple fields.
14. Use null for currentGoal if there is no active ongoing goal.
15. Use [] for empty lists.

Existing summary:
${input.existingSummary?.trim() || '(empty)'}

Recent chat history:
${this.formatRecentMessages(input.recentMessages) || '(empty)'}

Latest user message:
${input.userMessage}

Assistant context only:
${input.assistantMessage || '(empty)'}
`.trim();
  }

  private tryParseStructuredSummary(
    text: string,
    input: SummarizeConversationTurnInput,
  ): StructuredConversationSummary | null {
    const userGroundingText = this.buildUserGroundingText(input);
    const fullGroundingText = this.buildGroundingText(input);

    const candidates = this.extractJsonObjects(text);
    let firstParsed: StructuredConversationSummary | null = null;

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(
          candidate,
        ) as RawStructuredConversationSummary;

        const structured = this.dedupeStructuredSummary({
          currentGoal: this.cleanSummaryItem(
            parsed.currentGoal,
            userGroundingText,
            fullGroundingText,
          ),
          implemented: this.cleanSummaryItemList(
            parsed.implemented,
            userGroundingText,
            fullGroundingText,
          ),
          decisions: this.cleanSummaryItemList(
            parsed.decisions,
            userGroundingText,
            userGroundingText,
          ),
          openIssues: this.cleanSummaryItemList(
            parsed.openIssues,
            userGroundingText,
            fullGroundingText,
          ),
          nextSteps: this.cleanSummaryItemList(
            parsed.nextSteps,
            userGroundingText,
            fullGroundingText,
          ),
          constraints: this.cleanSummaryItemList(
            parsed.constraints,
            userGroundingText,
            fullGroundingText,
          ),
        });

        firstParsed ??= structured;

        if (this.hasUsefulStructuredContent(structured)) {
          return structured;
        }
      } catch {
        continue;
      }
    }

    return firstParsed;
  }

  private extractJsonObjects(text: string): string[] {
    const stripped = this.stripMarkdownFence(text);
    const objects: string[] = [];

    let start = -1;
    let depth = 0;

    for (let index = 0; index < stripped.length; index += 1) {
      const char = stripped[index];

      if (char === '{') {
        if (depth === 0) {
          start = index;
        }

        depth += 1;
      }

      if (char === '}') {
        depth -= 1;

        if (depth === 0 && start !== -1) {
          objects.push(stripped.slice(start, index + 1).trim());
          start = -1;
        }
      }
    }

    return objects;
  }

  private hasUsefulStructuredContent(
    summary: StructuredConversationSummary,
  ): boolean {
    const concreteItemCount =
      (summary.implemented?.length ?? 0) +
      (summary.decisions?.length ?? 0) +
      (summary.openIssues?.length ?? 0) +
      (summary.nextSteps?.length ?? 0) +
      (summary.constraints?.length ?? 0);

    return Boolean(summary.currentGoal) || concreteItemCount > 0;
  }

  private dedupeStructuredSummary(
    summary: StructuredConversationSummary,
  ): StructuredConversationSummary {
    const used = new Set<string>();

    const addUnique = (values?: string[]): string[] => {
      return (values ?? []).filter((value) => {
        const key = this.normalize(value);

        if (used.has(key)) {
          return false;
        }

        used.add(key);
        return true;
      });
    };

    const implemented = addUnique(summary.implemented);
    const decisions = addUnique(summary.decisions);
    const openIssues = addUnique(summary.openIssues);
    const nextSteps = addUnique(summary.nextSteps);
    const constraints = addUnique(summary.constraints);

    const currentGoal = summary.currentGoal;
    const currentGoalKey = currentGoal ? this.normalize(currentGoal) : '';

    return {
      currentGoal:
        currentGoal && currentGoalKey && !used.has(currentGoalKey)
          ? currentGoal
          : undefined,
      implemented,
      decisions,
      openIssues,
      nextSteps,
      constraints,
    };
  }

  private cleanSummaryItemList(
    values: unknown,
    evidenceGroundingText: string,
    supportGroundingText: string,
  ): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) =>
        this.cleanSummaryItem(
          value,
          evidenceGroundingText,
          supportGroundingText,
        ),
      )
      .filter((value): value is string => Boolean(value));
  }

  private cleanSummaryItem(
    value: unknown,
    evidenceGroundingText: string,
    supportGroundingText: string,
  ): string | undefined {
    const item = this.toStructuredSummaryItem(value);

    if (!item) {
      return undefined;
    }

    const content = this.cleanText(item.content);
    const evidence = this.cleanText(item.evidence);

    if (!content || !evidence) {
      return undefined;
    }

    if (!this.isEvidenceGrounded(evidence, evidenceGroundingText)) {
      return undefined;
    }

    if (
      !this.isContentSupportedByEvidence(
        content,
        evidence,
        supportGroundingText,
      )
    ) {
      return undefined;
    }

    return content;
  }

  private buildUserGroundingText(
    input: SummarizeConversationTurnInput,
  ): string {
    return this.toComparable(
      [
        input.existingSummary,
        this.formatRecentUserMessages(input.recentMessages),
        input.userMessage,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n'),
    );
  }

  private isContentSupportedByEvidence(
    content: string,
    evidence: string,
    groundingText: string,
  ): boolean {
    const supportText = this.toComparable(`${evidence}\n${groundingText}`);

    return this.isGroundedInText(content, supportText);
  }

  private toStructuredSummaryItem(
    value: unknown,
  ): StructuredSummaryItem | null {
    if (typeof value === 'string') {
      return {
        content: value,
        evidence: value,
      };
    }

    if (!this.isRecord(value)) {
      return null;
    }

    return {
      content: value.content,
      evidence: value.evidence,
    };
  }

  private cleanText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const cleaned = value.replace(/\s+/g, ' ').trim();

    if (/^<[^>]+>$/.test(cleaned)) {
      return undefined;
    }

    return cleaned.length > 0 ? cleaned : undefined;
  }

  private isEvidenceGrounded(evidence: string, groundingText: string): boolean {
    return this.isGroundedInText(evidence, groundingText, 0.34);
  }

  private isGroundedInText(
    value: string,
    comparableText: string,
    threshold = 0.5,
  ): boolean {
    const valueTokens = this.toComparable(value)
      .split(' ')
      .filter((token) => token.length >= 4);

    if (valueTokens.length === 0) {
      return false;
    }

    const matchedTokens = valueTokens.filter((token) =>
      comparableText.includes(token),
    );

    return matchedTokens.length / valueTokens.length >= threshold;
  }

  private buildGroundingText(input: SummarizeConversationTurnInput): string {
    return this.toComparable(
      [
        input.existingSummary,
        this.formatRecentMessages(input.recentMessages),
        input.userMessage,
        input.assistantMessage,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n'),
    );
  }

  private buildUserDecisionGroundingText(
    input: SummarizeConversationTurnInput,
  ): string {
    return this.toComparable(
      [
        input.existingSummary,
        this.formatRecentUserMessages(input.recentMessages),
        input.userMessage,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n'),
    );
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

  private formatRecentUserMessages(messages?: AiChatMessageContext[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    return messages
      .filter((message) => message.role === 'user')
      .map((message) => `USER: ${message.content}`)
      .join('\n');
  }

  private stripMarkdownFence(text: string): string {
    return text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  private extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');

    if (start === -1) {
      return null;
    }

    let depth = 0;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (char === '{') {
        depth += 1;
      }

      if (char === '}') {
        depth -= 1;
      }

      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }

    return null;
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
    const items = values ?? [];

    if (items.length === 0) {
      return undefined;
    }

    return `${label}: ${items.join('; ')}`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private toComparable(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trim()}...`;
  }

  private logStructuredSummaryShape(
    summary: StructuredConversationSummary | null,
  ): void {
    if (!summary) {
      this.logger.debug('[ConversationSummary] parsed=null');
      return;
    }

    this.logger.debug(
      `[ConversationSummary] groundedShape currentGoal=${Boolean(
        summary.currentGoal,
      )} implemented=${summary.implemented?.length ?? 0} decisions=${
        summary.decisions?.length ?? 0
      } openIssues=${summary.openIssues?.length ?? 0} nextSteps=${
        summary.nextSteps?.length ?? 0
      } constraints=${summary.constraints?.length ?? 0}`,
    );
  }
}
