import type {
  IndexQualityIssueCategory,
  IndexQualityIssueSeverity,
  IndexQualityReviewInput,
  IndexQualityReviewIssue,
  IndexQualityReviewResult,
} from '@ai/domain/interfaces/index-quality-review.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable } from '@nestjs/common';

interface RawIndexQualityReview {
  acceptable?: unknown;
  confidence?: unknown;
  summary?: unknown;
  issues?: unknown;
}

@Injectable()
export class ReviewIndexQualityUseCase {
  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlm: IStructuredLlmService,
  ) {}

  async execute(
    input: IndexQualityReviewInput,
  ): Promise<IndexQualityReviewResult> {
    const raw = await this.structuredLlm.generateObject<RawIndexQualityReview>({
      systemPrompt: this.systemPrompt(),
      userPrompt: JSON.stringify(input, null, 2),
      jsonSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['acceptable', 'confidence', 'summary', 'issues'],
        properties: {
          acceptable: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          summary: { type: 'string' },
          issues: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['category', 'severity', 'message'],
              properties: {
                category: {
                  type: 'string',
                  enum: [
                    'METADATA',
                    'SECTIONING',
                    'GROUNDING',
                    'VISUAL_CONTEXT',
                    'RETRIEVAL_QUALITY',
                  ],
                },
                severity: {
                  type: 'string',
                  enum: ['LOW', 'MEDIUM', 'HIGH'],
                },
                message: { type: 'string' },
                documentId: { type: 'string' },
              },
            },
          },
        },
      },
      maxTokens: 700,
      temperature: 0.05,
      timeoutMs: 8_000,
    });

    return {
      acceptable: raw.acceptable !== false,
      confidence: this.confidence(raw.confidence),
      summary:
        typeof raw.summary === 'string' && raw.summary.trim()
          ? raw.summary.trim()
          : 'No quality summary provided.',
      issues: this.issues(raw.issues),
    };
  }

  private systemPrompt(): string {
    return `
You are the final semantic quality reviewer for a video/reel retrieval index.

The deterministic pipeline has already validated hashes, timestamps, embeddings, parent relationships and transcript coverage. Review semantic usefulness only.

Check:
- metadata is useful and not misleading;
- long-video sections represent coherent topic boundaries;
- retrieval text is grounded in the supplied evidence rather than invented;
- visual context is useful when present and does not contradict transcript evidence;
- the documents are likely to answer future retrieval questions clearly.

Rules:
1. Do not reject merely because creator-authored metadata is short, informal or stylistic.
2. HIGH issues are reserved for likely hallucination, materially wrong section structure, contradictory evidence, or unusable retrieval content.
3. MEDIUM issues identify material quality degradation that is still recoverable.
4. LOW issues are advisory.
5. acceptable should be false only when at least one material MEDIUM/HIGH problem makes activation unsafe or clearly low quality.
6. Return only structured JSON matching the schema.
`.trim();
  }

  private confidence(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
  }

  private issues(value: unknown): IndexQualityReviewIssue[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item): IndexQualityReviewIssue | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const category = this.category(record['category']);
        const severity = this.severity(record['severity']);
        const message =
          typeof record['message'] === 'string' ? record['message'].trim() : '';
        if (!category || !severity || !message) return null;
        const documentId =
          typeof record['documentId'] === 'string' &&
          record['documentId'].trim()
            ? record['documentId'].trim()
            : undefined;
        return {
          category,
          severity,
          message,
          ...(documentId ? { documentId } : {}),
        };
      })
      .filter((item): item is IndexQualityReviewIssue => Boolean(item))
      .slice(0, 12);
  }

  private category(value: unknown): IndexQualityIssueCategory | null {
    return value === 'METADATA' ||
      value === 'SECTIONING' ||
      value === 'GROUNDING' ||
      value === 'VISUAL_CONTEXT' ||
      value === 'RETRIEVAL_QUALITY'
      ? value
      : null;
  }

  private severity(value: unknown): IndexQualityIssueSeverity | null {
    return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH'
      ? value
      : null;
  }
}
