import type { SummarizeConversationTurnInput } from '@ai/domain/interfaces/conversation-summarizer.service.interface';
import type { AiChatMessageContext } from '@common/ai/interfaces/chat-memory-context.interface';
import type { StructuredConversationSummary } from './conversation-summary.renderer';
import { extractLlmJsonObjects } from './llm-json-object-extractor';

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

export interface StructuredConversationSummaryShape {
  hasCurrentGoal: boolean;
  implementedCount: number;
  decisionsCount: number;
  openIssuesCount: number;
  nextStepsCount: number;
  constraintsCount: number;
}

const fakeEvidenceTags = new Set([
  'latest user message',
  'latest assistant context',
  'assistant context',
  'assistant answer',
  'existing summary',
  'recent chat history',
  'user message',
]);

export function parseConversationSummaryResult(
  text: string,
  input: SummarizeConversationTurnInput,
): StructuredConversationSummary | null {
  const userGroundingText = buildUserGroundingText(input);
  const fullGroundingText = buildGroundingText(input);

  const candidates = extractLlmJsonObjects(text);
  let firstParsed: StructuredConversationSummary | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as RawStructuredConversationSummary;

      const structured = dedupeStructuredSummary({
        currentGoal: cleanSummaryItem(
          parsed.currentGoal,
          userGroundingText,
          fullGroundingText,
        ),
        implemented: cleanSummaryItemList(
          parsed.implemented,
          userGroundingText,
          fullGroundingText,
        ),
        decisions: cleanSummaryItemList(
          parsed.decisions,
          userGroundingText,
          userGroundingText,
        ),
        openIssues: cleanSummaryItemList(
          parsed.openIssues,
          userGroundingText,
          fullGroundingText,
        ),
        nextSteps: cleanSummaryItemList(
          parsed.nextSteps,
          userGroundingText,
          fullGroundingText,
        ),
        constraints: cleanSummaryItemList(
          parsed.constraints,
          userGroundingText,
          fullGroundingText,
        ),
      });

      firstParsed ??= structured;

      if (hasUsefulStructuredConversationSummary(structured)) {
        return structured;
      }
    } catch {
      continue;
    }
  }

  return firstParsed;
}

export function hasUsefulStructuredConversationSummary(
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

export function getStructuredConversationSummaryShape(
  summary: StructuredConversationSummary | null,
): StructuredConversationSummaryShape | null {
  if (!summary) {
    return null;
  }

  return {
    hasCurrentGoal: Boolean(summary.currentGoal),
    implementedCount: summary.implemented?.length ?? 0,
    decisionsCount: summary.decisions?.length ?? 0,
    openIssuesCount: summary.openIssues?.length ?? 0,
    nextStepsCount: summary.nextSteps?.length ?? 0,
    constraintsCount: summary.constraints?.length ?? 0,
  };
}

function dedupeStructuredSummary(
  summary: StructuredConversationSummary,
): StructuredConversationSummary {
  const used = new Set<string>();

  const addUnique = (values?: string[]): string[] => {
    return (values ?? []).filter((value) => {
      const key = normalize(value);

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
  const currentGoalKey = currentGoal ? normalize(currentGoal) : '';

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

function cleanSummaryItemList(
  values: unknown,
  evidenceGroundingText: string,
  supportGroundingText: string,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) =>
      cleanSummaryItem(value, evidenceGroundingText, supportGroundingText),
    )
    .filter((value): value is string => Boolean(value));
}

function cleanSummaryItem(
  value: unknown,
  evidenceGroundingText: string,
  supportGroundingText: string,
): string | undefined {
  const item = toStructuredSummaryItem(value);

  if (!item) {
    return undefined;
  }

  const content = cleanText(item.content);
  const evidence = cleanText(item.evidence);

  if (!content || !evidence) {
    return undefined;
  }

  if (isFakeEvidenceTag(evidence)) {
    return undefined;
  }

  if (!isEvidenceGrounded(evidence, evidenceGroundingText)) {
    return undefined;
  }

  if (!isContentSupportedByEvidence(content, evidence, supportGroundingText)) {
    return undefined;
  }

  return content;
}

function buildUserGroundingText(input: SummarizeConversationTurnInput): string {
  return toComparable(
    [
      input.existingSummary,
      formatRecentUserMessages(input.recentMessages),
      input.userMessage,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n'),
  );
}

function buildGroundingText(input: SummarizeConversationTurnInput): string {
  return toComparable(
    [
      input.existingSummary,
      formatRecentMessages(input.recentMessages),
      input.userMessage,
      input.assistantMessage,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n'),
  );
}

function isContentSupportedByEvidence(
  content: string,
  evidence: string,
  groundingText: string,
): boolean {
  const supportText = toComparable(`${evidence}\n${groundingText}`);

  return isGroundedInText(content, supportText);
}

function toStructuredSummaryItem(value: unknown): StructuredSummaryItem | null {
  if (typeof value === 'string') {
    return {
      content: value,
      evidence: value,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  return {
    content: value.content,
    evidence: value.evidence,
  };
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return undefined;
  }

  if (isFakeEvidenceTag(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function isEvidenceGrounded(evidence: string, groundingText: string): boolean {
  return isGroundedInText(evidence, groundingText, 0.34);
}

function isFakeEvidenceTag(evidence: string): boolean {
  const comparable = toComparable(evidence.replace(/^<|>$/g, ''));

  return /^<[^>]+>$/.test(evidence) || fakeEvidenceTags.has(comparable);
}

function isGroundedInText(
  value: string,
  comparableText: string,
  threshold = 0.5,
): boolean {
  const valueTokens = toComparable(value)
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

function formatRecentMessages(messages?: AiChatMessageContext[]): string {
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

function formatRecentUserMessages(messages?: AiChatMessageContext[]): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  return messages
    .filter((message) => message.role === 'user')
    .map((message) => `USER: ${message.content}`)
    .join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function toComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
