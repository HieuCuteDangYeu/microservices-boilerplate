import { CreateSocialUserDto } from '@common/user/dtos/create-social-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class CreateSocialUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: CreateSocialUserDto) {
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(dto.email)}&background=random`;

    const newUser = new User(
      null,
      dto.email,
      null,
      dto.isVerified,
      null,
      dto.picture ?? avatarUrl,
      dto.provider,
      dto.providerId,
    );

    const savedUser = await this.userRepository.save(newUser);

    if (!savedUser.id) {
      throw new Error('Database failed to generate ID for social user');
    }

    return {
      id: savedUser.id,
      email: savedUser.email,
      isVerified: savedUser.isVerified,
    };
  }
}
