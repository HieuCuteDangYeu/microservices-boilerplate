import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class FindUserByEmailUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(email: string) {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      isVerified: user.isVerified,
    };
  }
}
