import { Inject, Injectable } from '@nestjs/common';
import type { IRecommendationConfig } from '@user/domain/interfaces/recommendation-config.interface';
import type { IRecommendationTelemetryService } from '@user/domain/interfaces/recommendation-telemetry-service.interface';
import type {
  GetRecommendedPublicUsersInput,
  RecommendedPublicUserProfile,
} from '@user/domain/interfaces/recommended-public-user.interface';
import type { IUserRepository } from '@user/domain/interfaces/user.repository.interface';

@Injectable()
export class GetRecommendedPublicUsersUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('IRecommendationConfig')
    private readonly recommendationConfig: IRecommendationConfig,
    @Inject('IRecommendationTelemetryService')
    private readonly recommendationTelemetryService: IRecommendationTelemetryService,
  ) {}

  async execute(
    input: GetRecommendedPublicUsersInput,
  ): Promise<RecommendedPublicUserProfile[]> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 30);
    const feedSessionId = input.feedSessionId ?? globalThis.crypto.randomUUID();
    const algorithmVersion = this.recommendationConfig.getAlgorithmVersion();
    const candidateSource = this.recommendationConfig.getCandidateSource();
    const featureFlags = this.recommendationConfig.getFeatureFlags();
    const startedAt = Date.now();

    try {
      const users = await this.userRepository.findRecommendedPublicUsers({
        limit,
        excludeUserId: input.excludeUserId,
      });

      const generatedAt = new Date().toISOString();

      const result = users.map((user, index) => ({
        id: user.id!,
        fullName: user.fullName,
        username: user.username,
        picture: user.picture,
        isVerified: user.isVerified,
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
        recommendationType: 'USER',
        algorithmVersion,
        feedSessionId,
        route: 'user.get_recommended_public',
        candidateSource,
        requestedLimit: limit,
        returnedItems: result.length,
        latencyMs: Math.max(0, Date.now() - startedAt),
        outcome: 'SUCCEEDED',
        featureFlags,
        occurredAt: generatedAt,
      });

      return result;
    } catch (error) {
      const occurredAt = new Date().toISOString();

      this.publishTelemetry({
        eventId: globalThis.crypto.randomUUID(),
        recommendationType: 'USER',
        algorithmVersion,
        feedSessionId,
        route: 'user.get_recommended_public',
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
