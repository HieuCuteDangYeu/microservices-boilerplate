import { GenerateRecommendationCandidatesUseCase } from '@content/application/recommendation/generate-recommendation-candidates.use-case';
import type { IFriendContentAccessService } from '@content/domain/interfaces/friend-content-access.service.interface';
import type { RecommendationCandidateSource } from '@content/domain/interfaces/recommendation-candidate.interface';
import type { IRecommendationConfig } from '@content/domain/interfaces/recommendation-config.interface';
import type { IRecommendationTelemetryService } from '@content/domain/interfaces/recommendation-telemetry-service.interface';
import type {
  GetRecommendedReelsInput,
  RecommendedReelsResult,
} from '@content/domain/interfaces/recommended-reels.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetRecommendedReelsUseCase {
  constructor(
    private readonly generateCandidates: GenerateRecommendationCandidatesUseCase,
    @Inject('IRecommendationConfig')
    private readonly recommendationConfig: IRecommendationConfig,
    @Inject('IRecommendationTelemetryService')
    private readonly recommendationTelemetryService: IRecommendationTelemetryService,
    @Inject('IFriendContentAccessService')
    private readonly friendContentAccessService: IFriendContentAccessService,
  ) {}

  async execute(
    input: GetRecommendedReelsInput,
  ): Promise<RecommendedReelsResult> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const feedSessionId = input.feedSessionId ?? globalThis.crypto.randomUUID();
    const algorithmVersion = this.recommendationConfig.getAlgorithmVersion();
    const pipelineCandidateSource =
      this.recommendationConfig.getCandidateSource();
    const featureFlags = this.recommendationConfig.getFeatureFlags();
    const startedAt = Date.now();

    try {
      const audience = await this.friendContentAccessService.getFeedAudience(
        input.viewerId,
      );
      const excludedUserIds = [
        ...new Set(
          [...audience.excludedUserIds, ...(input.excludedUserIds ?? [])]
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];

      const generated = await this.generateCandidates.execute({
        viewerId: input.viewerId,
        limit,
        cursor: input.cursor,
        excludedUserIds,
        friendUserIds: audience.friendUserIds,
        excludeRecentlySeen: input.excludeRecentlySeen,
      });
      const generatedAt = new Date().toISOString();
      const items = generated.items.map(({ reel, candidate }, index) => ({
        ...reel,
        recommendation: {
          recommendationId: globalThis.crypto.randomUUID(),
          feedSessionId,
          algorithmVersion,
          candidateSource: candidate.primarySource,
          candidateSources: candidate.sources,
          candidateReasons: candidate.reasons,
          candidateScore: Number(candidate.score.toFixed(6)),
          rank: index + 1,
          generatedAt,
        },
      }));
      const latencyMs = Math.max(0, Date.now() - startedAt);

      this.publishTelemetry({
        eventId: globalThis.crypto.randomUUID(),
        recommendationType: 'REEL',
        algorithmVersion,
        feedSessionId,
        route: 'content.get_recommended_reels',
        candidateSource: pipelineCandidateSource,
        requestedLimit: limit,
        returnedItems: items.length,
        latencyMs,
        outcome: 'SUCCEEDED',
        featureFlags,
        occurredAt: generatedAt,
      });
      this.publishSourceTelemetry({
        sourceCounts: generated.sourceCounts,
        algorithmVersion,
        feedSessionId,
        requestedLimit: limit,
        latencyMs,
        featureFlags,
        occurredAt: generatedAt,
      });

      return {
        items,
        nextCursor: generated.nextCursor,
        feedSessionId,
        algorithmVersion,
        generatedAt,
      };
    } catch (error) {
      const occurredAt = new Date().toISOString();
      this.publishTelemetry({
        eventId: globalThis.crypto.randomUUID(),
        recommendationType: 'REEL',
        algorithmVersion,
        feedSessionId,
        route: 'content.get_recommended_reels',
        candidateSource: pipelineCandidateSource,
        requestedLimit: limit,
        returnedItems: 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        outcome: 'FAILED',
        errorCode: this.errorCode(error),
        featureFlags,
        occurredAt,
      });
      throw error;
    }
  }

  private publishSourceTelemetry(input: {
    sourceCounts: Partial<Record<RecommendationCandidateSource, number>>;
    algorithmVersion: string;
    feedSessionId: string;
    requestedLimit: number;
    latencyMs: number;
    featureFlags: Record<string, boolean>;
    occurredAt: string;
  }): void {
    for (const [source, count] of Object.entries(input.sourceCounts)) {
      this.publishTelemetry({
        eventId: globalThis.crypto.randomUUID(),
        recommendationType: 'REEL',
        algorithmVersion: input.algorithmVersion,
        feedSessionId: input.feedSessionId,
        route: 'content.get_recommended_reels.candidate_source',
        candidateSource: source,
        requestedLimit: input.requestedLimit,
        returnedItems: count ?? 0,
        latencyMs: input.latencyMs,
        outcome: 'SUCCEEDED',
        featureFlags: input.featureFlags,
        occurredAt: input.occurredAt,
      });
    }
  }

  private publishTelemetry(
    event: Parameters<IRecommendationTelemetryService['publish']>[0],
  ): void {
    if (this.recommendationConfig.isTelemetryEnabled()) {
      this.recommendationTelemetryService.publish(event);
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && error.name.trim()) {
      return error.name.slice(0, 100);
    }
    return 'UNKNOWN_ERROR';
  }
}
