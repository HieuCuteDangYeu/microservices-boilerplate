import type {
  IRecommendationRankingConfig,
  RecommendationDiversityConfig,
  RecommendationFatigueConfig,
  RecommendationRankingWeights,
} from '@content/domain/interfaces/recommendation-ranking-config.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RecommendationRankingConfigService implements IRecommendationRankingConfig {
  constructor(private readonly configService: ConfigService) {}

  getWeights(): RecommendationRankingWeights {
    return {
      candidateScore: this.number('REEL_RANK_WEIGHT_CANDIDATE', 0.18, 0, 2),
      tagAffinity: this.number('REEL_RANK_WEIGHT_TAG_AFFINITY', 0.2, 0, 2),
      creatorAffinity: this.number(
        'REEL_RANK_WEIGHT_CREATOR_AFFINITY',
        0.12,
        0,
        2,
      ),
      contentSimilarity: this.number(
        'REEL_RANK_WEIGHT_CONTENT_SIMILARITY',
        0.12,
        0,
        2,
      ),
      trending: this.number('REEL_RANK_WEIGHT_TRENDING', 0.1, 0, 2),
      freshness: this.number('REEL_RANK_WEIGHT_FRESHNESS', 0.08, 0, 2),
      quality: this.number('REEL_RANK_WEIGHT_QUALITY', 0.07, 0, 2),
      completionRate: this.number('REEL_RANK_WEIGHT_COMPLETION', 0.07, 0, 2),
      replayRate: this.number('REEL_RANK_WEIGHT_REPLAY', 0.04, 0, 2),
      sessionIntent: this.number('REEL_RANK_WEIGHT_SESSION_INTENT', 0.08, 0, 2),
      skipRate: this.number('REEL_RANK_WEIGHT_SKIP', 0.08, 0, 2),
    };
  }

  getFatigueConfig(): RecommendationFatigueConfig {
    return {
      recentlySeenPenalty: this.number(
        'REEL_RANK_RECENTLY_SEEN_PENALTY',
        0.45,
        0,
        2,
      ),
      creatorThreshold: this.integer(
        'REEL_RANK_CREATOR_FATIGUE_THRESHOLD',
        4,
        1,
        100,
      ),
      creatorStep: this.number('REEL_RANK_CREATOR_FATIGUE_STEP', 0.06, 0, 1),
      creatorMaximum: this.number('REEL_RANK_CREATOR_FATIGUE_MAX', 0.4, 0, 2),
      topicThreshold: this.integer(
        'REEL_RANK_TOPIC_FATIGUE_THRESHOLD',
        5,
        1,
        100,
      ),
      topicStep: this.number('REEL_RANK_TOPIC_FATIGUE_STEP', 0.05, 0, 1),
      topicMaximum: this.number('REEL_RANK_TOPIC_FATIGUE_MAX', 0.35, 0, 2),
    };
  }

  getDiversityConfig(): RecommendationDiversityConfig {
    return {
      maxConsecutiveCreator: this.integer(
        'REEL_DIVERSITY_MAX_CONSECUTIVE_CREATOR',
        2,
        1,
        10,
      ),
      topicWindowSize: this.integer('REEL_DIVERSITY_TOPIC_WINDOW', 10, 1, 100),
      maxTopicPerWindow: this.integer(
        'REEL_DIVERSITY_MAX_TOPIC_PER_WINDOW',
        3,
        1,
        100,
      ),
      sourceWindowSize: this.integer(
        'REEL_DIVERSITY_SOURCE_WINDOW',
        10,
        1,
        100,
      ),
      maxSourcePerWindow: this.integer(
        'REEL_DIVERSITY_MAX_SOURCE_PER_WINDOW',
        4,
        1,
        100,
      ),
      nearDuplicateLookback: this.integer(
        'REEL_DIVERSITY_NEAR_DUPLICATE_LOOKBACK',
        4,
        1,
        50,
      ),
      nearDuplicateJaccardThreshold: this.number(
        'REEL_DIVERSITY_NEAR_DUPLICATE_THRESHOLD',
        0.8,
        0,
        1,
      ),
      explorationRatio: this.number(
        'REEL_DIVERSITY_EXPLORATION_RATIO',
        0.15,
        0,
        0.5,
      ),
    };
  }

  private number(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const raw = this.configService.get<string | number>(key);

    const value =
      raw === undefined || raw === null || raw === '' ? fallback : Number(raw);

    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be between ${minimum} and ${maximum}`);
    }

    return value;
  }

  private integer(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.number(key, fallback, minimum, maximum);

    if (!Number.isInteger(value)) {
      throw new Error(`${key} must be an integer`);
    }

    return value;
  }
}
