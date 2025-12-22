import {
  FindAllUsersPayload,
  PaginatedUsersResponse,
} from '@common/user/interfaces/find-all-users.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class FindAllUsersUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: FindAllUsersPayload): Promise<PaginatedUsersResponse> {
    const { page, limit, search, sort } = command;
    const skip = (page - 1) * limit;

    const { users, total } = await this.userRepository.findAll({
      skip,
      limit,
      search,
      sort,
    });

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
