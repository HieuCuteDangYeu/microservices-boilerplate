import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';

export function buildProfileMap(profiles: PublicUserProfile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

export function getPublicProfile(
  profilesById: Map<string, PublicUserProfile>,
  userId: string,
): PublicUserProfile {
  return (
    profilesById.get(userId) ?? {
      id: userId,
      fullName: 'Unknown User',
      username: 'unknown_user',
      picture: null,
      isVerified: false,
    }
  );
}
