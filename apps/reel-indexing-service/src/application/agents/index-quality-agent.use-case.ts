import type { IndexQualityReviewRequest } from '@common/ai/interfaces/index-quality-review.interface';
import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import { ValidatePersistedSemanticCandidateUseCase } from '@indexing/application/use-cases/validate-persisted-semantic-candidate.use-case';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import type { ISemanticCandidateInspector } from '@indexing/domain/interfaces/semantic-candidate-inspector.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IndexQualityAgentUseCase extends ValidatePersistedSemanticCandidateUseCase {
  private readonly agentLogger = new Logger(IndexQualityAgentUseCase.name);

  constructor(
    @Inject('ISemanticCandidateInspector') inspector: ISemanticCandidateInspector,
    @Inject('IIndexingAiService') private readonly ai: IIndexingAiService,
    private readonly config: ConfigService,
  ) {
    super(inspector);
  }

  override async execute(
    input: Parameters<ValidatePersistedSemanticCandidateUseCase['execute']>[0],
  ): Promise<void> {
    // Structural/integrity validation remains authoritative and always runs first.
    await super.execute(input);
    if (!this.enabled()) return;

    let review;
    try {
      review = await this.ai.reviewIndexQuality(
        this.toReviewRequest(input.job, input.documents),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.required()) throw error;
      this.agentLogger.warn(
        `[IndexQualityAgent] review unavailable; structural gate remains authoritative: ${message}`,
      );
      return;
    }

    const issueSummary = review.issues
      .map((issue) => `${issue.severity}:${issue.category}`)
      .join(',');
    this.agentLogger.log(
      `[IndexQualityAgent] reelId=${input.job.reelId} acceptable=${review.acceptable} confidence=${review.confidence.toFixed(2)} issues=${issueSummary || 'none'}`,
    );

    if (!review.acceptable && this.enforced()) {
      const details = review.issues
        .filter((issue) => issue.severity !== 'LOW')
        .slice(0, 4)
        .map((issue) => issue.message)
        .join('; ');
      throw new Error(
        `Semantic quality agent rejected inactive index candidate${details ? `: ${details}` : ''}`,
      );
    }

    if (!review.acceptable) {
      this.agentLogger.warn(
        `[IndexQualityAgent] advisory rejection reelId=${input.job.reelId}: ${review.summary}`,
      );
    }
  }

  private toReviewRequest(
    job: Parameters<ValidatePersistedSemanticCandidateUseCase['execute']>[0]['job'],
    documents: ReelIndexDocument[],
  ): IndexQualityReviewRequest {
    const prioritized = [...documents]
      .sort(
        (left, right) =>
          this.kindPriority(left.kind) - this.kindPriority(right.kind),
      )
      .slice(
        0,
        this.positiveInt('INDEX_QUALITY_AGENT_MAX_DOCUMENTS', 36, 8, 80),
      );

    return {
      reelId: job.reelId,
      sourceLengthClass: job.sourceLengthClass,
      durationMs: job.sourceDurationMs,
      title: job.title,
      description: job.description,
      tags: job.tags,
      documents: prioritized.map((document) => ({
        id: document.id,
        kind: document.kind,
        ordinal: document.ordinal,
        parentId: document.parentId,
        startTime: document.startTime,
        endTime: document.endTime,
        evidenceQuality: document.evidenceQuality,
        text: (document.evidenceText ||
          document.derivedSummary ||
          document.retrievalText)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1_200),
      })),
    };
  }

  private kindPriority(kind: ReelIndexDocument['kind']): number {
    if (kind === 'REEL') return 0;
    if (kind === 'SECTION') return 1;
    if (kind === 'VISUAL_SCENE') return 2;
    return 3;
  }

  private enabled(): boolean {
    const configured = this.config
      .get<string>('INDEX_QUALITY_AGENT_ENABLED')
      ?.trim()
      .toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return (
      this.config.get<string>('NODE_ENV')?.trim().toLowerCase() !== 'production'
    );
  }

  private enforced(): boolean {
    return this.boolean('INDEX_QUALITY_AGENT_ENFORCE', false);
  }

  private required(): boolean {
    return this.boolean('INDEX_QUALITY_AGENT_REQUIRED', false);
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  private positiveInt(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, Math.round(value)))
      : fallback;
  }
}
