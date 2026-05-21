import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class FindPublicUsersByIdsUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(ids: string[]): Promise<PublicUserProfile[]> {
    const users = await this.userRepository.findByIds(ids);
    const profilesById = new Map(
      users.map((user) => [
        user.id!,
        {
          id: user.id!,
          fullName: user.fullName,
          username: user.username,
          picture: user.picture,
          isVerified: user.isVerified,
        },
      ]),
    );

    return ids
      .map((id) => profilesById.get(id))
      .filter((profile): profile is PublicUserProfile => Boolean(profile));
  }
}
