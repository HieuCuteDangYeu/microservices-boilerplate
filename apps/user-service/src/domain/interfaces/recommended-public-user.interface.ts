import type { RecommendationMetadata } from '@common/recommendation/interfaces/recommendation-metadata.interface';

export interface GetRecommendedPublicUsersInput {
  limit?: number;
  excludeUserId?: string;
  feedSessionId?: string;
}

export interface RecommendedPublicUserProfile {
  id: string;
  fullName: string;
  username: string | null;
  picture: string | null;
  isVerified: boolean;
  recommendation: RecommendationMetadata;
}
