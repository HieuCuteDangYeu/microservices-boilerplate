import { CreateSocialUserDto } from '@common/user/dtos/create-social-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
      randomUUID(),
      dto.email,
      null,
      dto.isVerified,
      new Date(),
      dto.picture ?? avatarUrl,
      dto.provider,
      dto.providerId,
    );

    const savedUser = await this.userRepository.save(newUser);

    return {
      id: savedUser.id,
      email: savedUser.email,
      isVerified: savedUser.isVerified,
    };
  }
}
