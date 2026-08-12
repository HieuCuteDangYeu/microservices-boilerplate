import type {
  CitationAttributionCandidate,
  CitationAttributionSelection,
  ICitationAttributionService,
} from '@ai/domain/interfaces/citation-attribution.service.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RawCitationSelection {
  evidenceId?: unknown;
  confidence?: unknown;
}

interface RawCitationAttributionResult {
  citations?: unknown;
}

@Injectable()
export class CloudflareCitationAttributionAdapter
  implements ICitationAttributionService
{
  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
    private readonly configService: ConfigService,
  ) {}

  async attribute(input: {
    question: string;
    answer: string;
    candidates: CitationAttributionCandidate[];
    maxCitations: number;
  }): Promise<CitationAttributionSelection[]> {
    if (!input.answer.trim() || input.candidates.length === 0) {
      return [];
    }

    const model =
      this.configService.get<string>('CLOUDFLARE_CITATION_MODEL')?.trim() ||
      '@cf/meta/llama-3.1-8b-instruct';
    const minConfidence = this.number(
      'AI_RAG_CITATION_MIN_CONFIDENCE',
      0.65,
      0,
      1,
    );
    const maxCandidates = Math.round(
      this.number('AI_RAG_CITATION_CANDIDATE_LIMIT', 8, 1, 20),
    );
    const candidates = input.candidates.slice(0, maxCandidates);

    const result =
      await this.structuredLlmService.generateObject<RawCitationAttributionResult>({
        model,
        systemPrompt: this.systemPrompt(),
        userPrompt: this.userPrompt({ ...input, candidates }),
        jsonSchema: {
          type: 'object',
          properties: {
            citations: {
              type: 'array',
              maxItems: input.maxCitations,
              items: {
                type: 'object',
                properties: {
                  evidenceId: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['evidenceId', 'confidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['citations'],
          additionalProperties: false,
        },
        maxTokens: 350,
        temperature: 0,
      });

    const allowedIds = new Set(candidates.map((candidate) => candidate.evidenceId));
    const rawSelections = Array.isArray(result.citations)
      ? (result.citations as RawCitationSelection[])
      : [];
    const seen = new Set<string>();
    const selections: CitationAttributionSelection[] = [];

    for (const raw of rawSelections) {
      const evidenceId =
        typeof raw?.evidenceId === 'string' ? raw.evidenceId.trim() : '';
      const confidence = Number(raw?.confidence);

      if (
        !evidenceId ||
        !allowedIds.has(evidenceId) ||
        seen.has(evidenceId) ||
        !Number.isFinite(confidence) ||
        confidence < minConfidence ||
        confidence > 1
      ) {
        continue;
      }

      seen.add(evidenceId);
      selections.push({ evidenceId, confidence });

      if (selections.length >= input.maxCitations) {
        break;
      }
    }

    return selections;
  }

  private systemPrompt(): string {
    return [
      'You are a citation attribution verifier for a video RAG system.',
      'Your task is NOT to answer the question and NOT to rewrite evidence.',
      'Select the smallest set of supplied evidence IDs that directly supports factual claims in the final answer.',
      'Do not select evidence merely because it is topically related.',
      'TRANSCRIPT evidence supports only what is stated in the transcript.',
      'VISUAL evidence supports only what is visible in the sampled frame at its timestamp; never infer events between sampled frames.',
      'METADATA evidence supports only reel metadata.',
      'If the final answer is a refusal, generic conversational response, or no supplied evidence directly supports it, return an empty citations array.',
      'Never invent an evidence ID. Return only IDs exactly as supplied.',
      'Confidence is how directly that evidence supports a factual claim in the final answer, from 0 to 1.',
    ].join(' ');
  }

  private userPrompt(input: {
    question: string;
    answer: string;
    candidates: CitationAttributionCandidate[];
    maxCitations: number;
  }): string {
    const evidence = input.candidates
      .map((candidate) =>
        [
          `EVIDENCE_ID: ${candidate.evidenceId}`,
          `TYPE: ${candidate.evidenceType}`,
          `REEL_ID: ${candidate.reelId}`,
          candidate.title ? `TITLE: ${candidate.title}` : '',
          typeof candidate.startTime === 'number'
            ? `START_TIME: ${candidate.startTime}`
            : '',
          typeof candidate.endTime === 'number'
            ? `END_TIME: ${candidate.endTime}`
            : '',
          `EVIDENCE: ${candidate.evidenceText}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n---\n\n');

    return [
      `QUESTION:\n${input.question.trim()}`,
      `FINAL ANSWER:\n${input.answer.trim()}`,
      `MAX CITATIONS: ${input.maxCitations}`,
      `CANDIDATE EVIDENCE:\n${evidence}`,
    ].join('\n\n');
  }

  private number(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  }
}
