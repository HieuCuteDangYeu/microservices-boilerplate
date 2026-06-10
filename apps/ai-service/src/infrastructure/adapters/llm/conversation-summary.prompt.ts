import type { SummarizeConversationTurnInput } from '@ai/domain/interfaces/conversation-summarizer.service.interface';
import type { AiChatMessageContext } from '@common/ai/interfaces/chat-memory-context.interface';

export interface ConversationSummaryPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export function buildConversationSummaryPrompt(
  input: SummarizeConversationTurnInput,
): ConversationSummaryPrompt {
  return {
    systemPrompt: buildConversationSummarySystemPrompt(),
    userPrompt: buildConversationSummaryUserPrompt(input),
  };
}

function buildConversationSummarySystemPrompt(): string {
  return `
You are a strict JSON updater for conversation-level rolling summary memory.

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

Each non-null value must be an object:
{
  "content": "short memory value",
  "evidence": "exact copied text from the input"
}

For list fields, each array item must use that same object shape.

Conversation summary boundary:
- Store progress inside this specific conversation: current goal, completed work, decisions, open issues, next steps, constraints.
- Do not store stable user profile/preference facts here unless they are also relevant as current conversation constraints.
- Do not invent projects, preferences, bugs, tools, decisions, next steps, or constraints.

Grounding rules:
1. Use only the provided input.
2. User messages and existing summary are valid sources for summary memory.
3. Latest user message is the source of truth for new memory.
4. Assistant messages are only context for resolving references like "that", "it", or "this feature".
5. Do not create new memory from assistant text alone.
6. Evidence must be exact copied text from the input.
7. Evidence must be a string, not an array.
8. Evidence must not be a section label, XML-like tag, or placeholder.
9. Never use evidence like "<latest_user_message>", "<existing_summary>", or "<latest_assistant_context>".
10. Put completed work only in implemented.
11. Put active ongoing work only in currentGoal.
12. Do not put the same memory in multiple fields.
13. Use null for currentGoal if there is no active ongoing goal.
14. Use [] for empty lists.
`.trim();
}

function buildConversationSummaryUserPrompt(
  input: SummarizeConversationTurnInput,
): string {
  return `
EXISTING SUMMARY:
${input.existingSummary?.trim() || '(empty)'}

RECENT CHAT HISTORY:
${formatRecentMessages(input.recentMessages) || '(empty)'}

LATEST USER MESSAGE:
${input.userMessage}

LATEST ASSISTANT CONTEXT ONLY:
${input.assistantMessage || '(empty)'}
`.trim();
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
