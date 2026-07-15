import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import type { IFriendContentAccessService } from '@content/domain/interfaces/friend-content-access.service.interface';
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
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
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

    const candidateSource = this.recommendationConfig.getCandidateSource();

    const featureFlags = this.recommendationConfig.getFeatureFlags();
    const startedAt = Date.now();

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

    try {
      const result = await this.contentRepository.listRecommendedReels({
        viewerId: input.viewerId,
        limit,
        cursor: input.cursor,
        excludeRecentlySeen: input.excludeRecentlySeen,
        excludedUserIds,
      });

      const generatedAt = new Date().toISOString();

      const items = result.items.map((reel, index) => ({
        ...reel,
        recommendation: {
          recommendationId: globalThis.crypto.randomUUID(),
          feedSessionId,
          algorithmVersion,
          candidateSource,
          rank: index + 1,
          generatedAt,
        },
      }));

      this.publishTelemetry({
        eventId: globalThis.crypto.randomUUID(),
        recommendationType: 'REEL',
        algorithmVersion,
        feedSessionId,
        route: 'content.get_recommended_reels',
        candidateSource,
        requestedLimit: limit,
        returnedItems: items.length,
        latencyMs: Math.max(0, Date.now() - startedAt),
        outcome: 'SUCCEEDED',
        featureFlags,
        occurredAt: generatedAt,
      });

      return {
        items,
        nextCursor: result.nextCursor,
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
        candidateSource,
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

  private publishTelemetry(
    event: Parameters<IRecommendationTelemetryService['publish']>[0],
  ): void {
    if (!this.recommendationConfig.isTelemetryEnabled()) {
      return;
    }

    this.recommendationTelemetryService.publish(event);
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && error.name.trim()) {
      return error.name.slice(0, 100);
    }

    return 'UNKNOWN_ERROR';
  }
}
