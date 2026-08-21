import type {
  CitationAttributionCandidate,
  ICitationAttributionService,
} from '@ai/domain/interfaces/citation-attribution.service.interface';
import type {
  RagChatWorkflowState,
  RagCitation,
  RagCitationCoverageResult,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface GroundedCitationCandidate {
  attribution: CitationAttributionCandidate;
  citation: RagCitation;
}

export interface RagCitationAssessment {
  citations: RagCitation[];
  coverage: RagCitationCoverageResult;
}

@Injectable()
export class BuildRagCitationsUseCase {
  private readonly logger = new Logger(BuildRagCitationsUseCase.name);
  private readonly maxCitations = 3;

  constructor(
    @Inject('ICitationAttributionService')
    private readonly citationAttributionService: ICitationAttributionService,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<RagCitationAssessment> {
    if (
      state.route?.intent !== 'REEL_VIDEO_QUESTION' ||
      state.contextSufficiency?.sufficient === false
    ) {
      return this.notRequired();
    }

    const answer = state.answer?.trim();
    if (!answer) {
      return this.notRequired();
    }

    const candidates = this.buildCandidates(state);
    if (candidates.length === 0) {
      return this.notRequired();
    }

    try {
      const attribution = await this.citationAttributionService.attribute({
        question: state.userMessage,
        answer,
        candidates: candidates.map((candidate) => candidate.attribution),
        maxCitations: this.maxCitations,
      });

      const byEvidenceId = new Map(
        candidates.map((candidate) => [
          candidate.attribution.evidenceId,
          candidate,
        ]),
      );
      const citations: RagCitation[] = [];
      const seen = new Set<string>();

      for (const selection of attribution.selections) {
        const candidate = byEvidenceId.get(selection.evidenceId);
        if (!candidate || seen.has(selection.evidenceId)) continue;

        seen.add(selection.evidenceId);
        citations.push(candidate.citation);

        if (citations.length >= this.maxCitations) break;
      }

      return {
        citations,
        coverage: {
          mode: 'LLM',
          coverage: attribution.coverage,
          factualClaimCount: attribution.factualClaimCount,
          supportedClaimCount: attribution.supportedClaimCount,
          unsupportedClaims: attribution.claims
            .filter((claim) => !claim.supported)
            .map((claim) => claim.claim)
            .slice(0, 6),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[CitationAttribution] provider failed; using grounded deterministic fallback: ${message}`,
      );

      return {
        citations: candidates
          .slice(0, this.maxCitations)
          .map((candidate) => candidate.citation),
        coverage: {
          mode: 'FALLBACK',
          coverage: 1,
          factualClaimCount: 0,
          supportedClaimCount: 0,
          unsupportedClaims: [],
        },
      };
    }
  }

  private notRequired(): RagCitationAssessment {
    return {
      citations: [],
      coverage: {
        mode: 'NOT_REQUIRED',
        coverage: 1,
        factualClaimCount: 0,
        supportedClaimCount: 0,
        unsupportedClaims: [],
      },
    };
  }

  private buildCandidates(
    state: RagChatWorkflowState,
  ): GroundedCitationCandidate[] {
    const seen = new Set<string>();
    const candidates: GroundedCitationCandidate[] = [];

    for (const chunk of state.rerankedChunks) {
      const key = `${chunk.reelId}:${chunk.chunkId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const evidenceType = chunk.evidenceType ?? 'TRANSCRIPT';
      const evidence =
        chunk.evidenceText?.trim() ||
        (evidenceType === 'METADATA' ? chunk.chunkText.trim() : '');
      if (!evidence) continue;

      const startTime = this.toOptionalNumber(chunk.startTime);
      const endTime = this.toOptionalNumber(chunk.endTime);
      const evidenceId = `e${candidates.length}`;

      candidates.push({
        attribution: {
          evidenceId,
          reelId: chunk.reelId,
          evidenceType,
          evidenceText: this.exactQuote(evidence, 1_200),
          title: chunk.title ?? undefined,
          startTime,
          endTime,
        },
        citation: {
          sourceType: 'REEL',
          reelId: chunk.reelId,
          evidenceType,
          title: chunk.title ?? undefined,
          startTime,
          endTime,
          quote: this.exactQuote(evidence, 240),
        },
      });

      if (candidates.length >= 12) break;
    }

    return candidates;
  }

  private toOptionalNumber(
    value: number | null | undefined,
  ): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return undefined;
    }

    return value;
  }

  private exactQuote(value: string, maxLength: number): string {
    const clean = value.replace(/\s+/g, ' ').trim();

    if (clean.length <= maxLength) {
      return clean;
    }

    const boundary = clean.lastIndexOf(' ', maxLength);
    return clean.slice(0, boundary > 0 ? boundary : maxLength).trim();
  }
}
