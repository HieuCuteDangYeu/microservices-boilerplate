import type { ExtractUserMemoriesRequest } from '@common/ai/interfaces/extract-user-memory.interface';

export function buildUserMemoryExtractionPrompt(
  input: ExtractUserMemoriesRequest,
): string {
  return `
Return only valid JSON. No markdown. No explanation.

You extract stable long-term user memories from one conversation turn.

Use the USER MESSAGE as the only source of truth.
The assistant answer is context only. Do not extract memories from assistant wording.

Required JSON shape:
{
  "memories": [
    {
      "type": "",
      "content": "",
      "confidence": 0,
      "scope": "",
      "evidence": ""
    }
  ]
}

Allowed type values:
- PREFERENCE
- PROFILE
- TECHNICAL_CONTEXT
- COMMUNICATION_STYLE
- OTHER

Allowed scope values:
- LONG_TERM
- TEMPORARY

Field meanings:
- type: exactly one allowed type value.
- content: one stable memory about the user.
- confidence: number between 0 and 1.
- scope: LONG_TERM only for durable future-useful memory; TEMPORARY for short-lived or current-turn-only information.
- evidence: short exact text copied from the USER MESSAGE.

Rules:
1. Return only valid JSON.
2. Do not wrap JSON in markdown fences.
3. Do not copy the field meanings into the JSON values.
4. Do not output combined enum strings such as "PREFERENCE|PROFILE|TECHNICAL_CONTEXT|COMMUNICATION_STYLE|OTHER".
5. Do not output combined scope strings such as "LONG_TERM|TEMPORARY".
6. Only return LONG_TERM memories when the USER MESSAGE contains durable context useful in future conversations.
7. Return TEMPORARY for short-lived status updates, one-time debugging steps, or current-turn-only information.
8. The evidence must be copied from the USER MESSAGE, not the assistant answer.
9. If there is no exact evidence from the USER MESSAGE, return {"memories":[]}.
10. Do not store assistant offers, assistant capabilities, assistant wording, or generic assistant replies.
11. Do not store secrets, credentials, tokens, or private sensitive personal data.
12. If there is no stable long-term user memory, return {"memories":[]}.

User message:
<user_message>
${input.userMessage}
</user_message>

Assistant answer for context only:
<assistant_answer>
${input.assistantMessage}
</assistant_answer>
`.trim();
}
