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
        proposedClaims: state.answerClaims,
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
      const selectedEvidenceIds: string[] = [];
      const seen = new Set<string>();

      for (const selection of attribution.selections) {
        const candidate = byEvidenceId.get(selection.evidenceId);
        if (!candidate || seen.has(selection.evidenceId)) continue;

        seen.add(selection.evidenceId);
        citations.push(candidate.citation);
        selectedEvidenceIds.push(selection.evidenceId);

        if (citations.length >= this.maxCitations) break;
      }

      const coverage: RagCitationCoverageResult = {
        mode: 'LLM',
        coverage: attribution.coverage,
        factualClaimCount: attribution.factualClaimCount,
        supportedClaimCount: attribution.supportedClaimCount,
        unsupportedClaims: attribution.claims
          .filter((claim) => !claim.supported)
          .map((claim) => claim.claim)
          .slice(0, 6),
      };
      return {
        citations,
        coverage: {
          ...coverage,
          diagnostics: {
            decisionSource: 'LLM',
            selectedEvidenceIds,
            deterministicSupportingEvidenceIds: [],
            modelRole: attribution.diagnostics?.modelRole,
            model: attribution.diagnostics?.model,
            providerStatus: 'SUCCESS',
          },
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[CitationAttribution] provider failed; citation coverage is incomplete: ${message}`,
      );

      return {
        citations: [],
        coverage: {
          mode: 'FALLBACK',
          coverage: 0,
          factualClaimCount: 1,
          supportedClaimCount: 0,
          unsupportedClaims: [answer.slice(0, 500)],
          diagnostics: {
            decisionSource: 'FALLBACK',
            selectedEvidenceIds: [],
            deterministicSupportingEvidenceIds: [],
            modelRole: 'CITATION_ATTRIBUTION',
            providerStatus: 'ERROR',
          },
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
        diagnostics: {
          decisionSource: 'NOT_REQUIRED',
          selectedEvidenceIds: [],
          deterministicSupportingEvidenceIds: [],
          modelRole: 'CITATION_ATTRIBUTION',
          providerStatus: 'NOT_CALLED',
        },
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
