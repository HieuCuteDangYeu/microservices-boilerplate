import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '@user/domain/interfaces/user.repository.interface';

@Injectable()
export class ValidateUsersListUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(ids: string[]): Promise<boolean> {
    if (!ids || ids.length === 0) return false;

    const uniqueIds = [...new Set(ids)];

    const count = await this.userRepository.countUsersByIds(uniqueIds);

    return count === uniqueIds.length;
  }
}
