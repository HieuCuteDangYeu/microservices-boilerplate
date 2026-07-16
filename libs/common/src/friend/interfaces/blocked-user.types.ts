import type { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';

export interface BlockedUserSummary {
  blockedAt: Date;
  user: PublicUserProfile;
}
