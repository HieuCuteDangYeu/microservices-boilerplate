import { UpdateAvatarDto } from '@common/user/dtos/update-avatar.dto';
import { Inject, Injectable } from '@nestjs/common';
import { InvalidAvatarFileError } from '@user/domain/errors/invalid-avatar-file.error';
import { UserNotFoundError } from '@user/domain/errors/user-not-found.error';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class UpdateUserAvatarUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
    @Inject('IStorageService') private readonly storageService: IStorageService,
  ) {}

  async execute(userId: string, payload: UpdateAvatarDto) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const fileExists = await this.storageService.checkFileExists(
      payload.avatarKey,
    );

    if (!fileExists) {
      throw new InvalidAvatarFileError();
    }

    const updatedEntity = await this.userRepository.update(userId, {
      picture: payload.avatarKey,
    });

    return {
      id: updatedEntity.id,
      email: updatedEntity.email,
      picture: updatedEntity.picture,
    };
  }
}
