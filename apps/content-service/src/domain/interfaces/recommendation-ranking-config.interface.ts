export interface RecommendationRankingWeights {
  candidateScore: number;
  tagAffinity: number;
  creatorAffinity: number;
  contentSimilarity: number;
  trending: number;
  freshness: number;
  quality: number;
  completionRate: number;
  replayRate: number;
  sessionIntent: number;
  skipRate: number;
}

export interface RecommendationFatigueConfig {
  recentlySeenPenalty: number;
  creatorThreshold: number;
  creatorStep: number;
  creatorMaximum: number;
  topicThreshold: number;
  topicStep: number;
  topicMaximum: number;
}

export interface RecommendationDiversityConfig {
  maxConsecutiveCreator: number;
  topicWindowSize: number;
  maxTopicPerWindow: number;
  sourceWindowSize: number;
  maxSourcePerWindow: number;
  nearDuplicateLookback: number;
  nearDuplicateJaccardThreshold: number;
  explorationRatio: number;
}

export interface IRecommendationRankingConfig {
  getWeights(): RecommendationRankingWeights;
  getFatigueConfig(): RecommendationFatigueConfig;
  getDiversityConfig(): RecommendationDiversityConfig;
}
