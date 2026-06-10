import type {
  ExtractedUserMemoryCandidate,
  ExtractedUserMemoryScope,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { extractLlmJsonObjects } from './llm-json-object-extractor';

interface RawExtractedUserMemoryCandidate {
  type?: unknown;
  content?: unknown;
  confidence?: unknown;
  scope?: unknown;
  evidence?: unknown;
}

interface RawExtractUserMemoriesResult {
  memories?: unknown;
}

const allowedTypes = new Set<UserMemoryType>([
  'PREFERENCE',
  'PROFILE',
  'TECHNICAL_CONTEXT',
  'COMMUNICATION_STYLE',
  'OTHER',
]);

export function parseUserMemoryExtractionResult(
  text: string,
): ExtractUserMemoriesResult {
  const candidates = extractLlmJsonObjects(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as RawExtractUserMemoriesResult;

      if (!Array.isArray(parsed.memories)) {
        continue;
      }

      const memories = parsed.memories
        .map((memory) =>
          toMemoryCandidate(memory as RawExtractedUserMemoryCandidate),
        )
        .filter(
          (memory): memory is ExtractedUserMemoryCandidate => memory !== null,
        );

      return {
        memories,
      };
    } catch {
      continue;
    }
  }

  return {
    memories: [],
  };
}

function toMemoryCandidate(
  memory: RawExtractedUserMemoryCandidate,
): ExtractedUserMemoryCandidate | null {
  const type = parseType(memory.type);

  if (!type) {
    return null;
  }

  const scope = parseScope(memory.scope);

  if (!scope) {
    return null;
  }

  if (typeof memory.content !== 'string') {
    return null;
  }

  if (typeof memory.evidence !== 'string') {
    return null;
  }

  const content = sanitizeText(memory.content);
  const evidence = sanitizeText(memory.evidence);

  if (!content || !evidence) {
    return null;
  }

  return {
    type,
    content,
    confidence: parseConfidence(memory.confidence),
    scope,
    evidence,
  };
}

function parseType(value: unknown): UserMemoryType | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (allowedTypes.has(normalized as UserMemoryType)) {
    return normalized as UserMemoryType;
  }

  return null;
}

function parseScope(value: unknown): ExtractedUserMemoryScope | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === 'LONG_TERM' || normalized === 'TEMPORARY') {
    return normalized;
  }

  return null;
}

function parseConfidence(value: unknown): number {
  if (typeof value !== 'number') {
    return 0;
  }

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 1));
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
