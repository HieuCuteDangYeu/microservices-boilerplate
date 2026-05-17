import {
  UpdateUserPayload,
  UpdateUserResponse,
} from '@common/user/interfaces/update-user.types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  normalizeFullName,
  normalizeUsername,
} from '@user/application/utils/public-identity.utils';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { UserNotFoundError } from '@user/domain/errors/user-not-found.error';
import { UsernameAlreadyTakenError } from '@user/domain/errors/username-already-taken.error';
import * as bcrypt from 'bcrypt';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: UpdateUserPayload): Promise<UpdateUserResponse> {
    const { id, data } = command;

    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    if (data.fullName !== undefined) {
      data.fullName = normalizeFullName(data.fullName);
    }

    if (data.username !== undefined) {
      const normalizedUsername = normalizeUsername(data.username);
      const isAvailable = await this.userRepository.isUsernameAvailable(
        normalizedUsername,
        id,
      );

      if (!isAvailable) {
        throw new UsernameAlreadyTakenError(normalizedUsername);
      }

      data.username = normalizedUsername;
    }

    try {
      const updatedUser = await this.userRepository.update(id, data);

      return {
        id: updatedUser.id!,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        username: updatedUser.username,
        picture: updatedUser.picture,
        createdAt: updatedUser.createdAt!,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UserNotFoundError(id);
      }

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

        if (target.includes('email') && data.email) {
          throw new UserAlreadyExistsError(data.email);
        }

        if (target.includes('username') && data.username) {
          throw new UsernameAlreadyTakenError(data.username);
        }
      }

      throw error;
    }
  }
}
