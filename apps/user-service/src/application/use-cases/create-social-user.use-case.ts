import { CreateSocialUserDto } from '@common/user/dtos/create-social-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  deriveFullName,
  normalizeFullName,
} from '@user/application/utils/public-identity.utils';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { User } from '../../domain/entities/user.entity';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class CreateSocialUserUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: CreateSocialUserDto) {
    const fullName = dto.fullName
      ? normalizeFullName(dto.fullName)
      : deriveFullName(dto.email);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`;

    const newUser = new User(
      null,
      dto.email,
      fullName,
      null,
      null,
      dto.isVerified,
      null,
      dto.picture ?? avatarUrl,
      dto.provider,
      dto.providerId,
    );

    let savedUser: User;

    try {
      savedUser = await this.userRepository.save(newUser);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const rawTarget = error.meta?.target;
        const target = Array.isArray(rawTarget)
          ? rawTarget.map(String).join(',')
          : typeof rawTarget === 'string'
            ? rawTarget
            : '';

        if (target.includes('email')) {
          throw new UserAlreadyExistsError(dto.email);
        }
      }

      throw error;
    }

    if (!savedUser.id) {
      throw new Error('Database failed to generate ID for social user');
    }

    return {
      id: savedUser.id,
      email: savedUser.email,
      fullName: savedUser.fullName,
      username: savedUser.username,
      isVerified: savedUser.isVerified,
      picture: savedUser.picture,
      provider: savedUser.provider,
      providerId: savedUser.providerId,
    };
  }
}
