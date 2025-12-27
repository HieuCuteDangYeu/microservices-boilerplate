import {
  UpdateUserPayload,
  UpdateUserResponse,
} from '@common/user/interfaces/update-user.types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UserNotFoundError } from '@user/domain/errors/user-not-found.error';
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

    try {
      const updatedUser = await this.userRepository.update(id, data);

      return {
        id: updatedUser.id!,
        email: updatedUser.email,
        createdAt: updatedUser.createdAt!,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UserNotFoundError(id);
      }
      throw error;
    }
  }
}
