import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';

export interface IUserService {
  findPublicUsersByIds(ids: string[]): Promise<PublicUserProfile[]>;
}
