import { ValidateUserResponse } from '@common/user/interfaces/validate-user-response.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class FindUsersByIdsUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(ids: string[]): Promise<ValidateUserResponse[]> {
    const users = await this.userRepository.findByIds(ids);

    return users.map((user) => ({
      id: user.id!,
      email: user.email,
      picture: user.picture,
    }));
  }
}
