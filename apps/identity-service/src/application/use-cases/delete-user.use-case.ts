import {
  DeleteUserPayload,
  DeleteUserResponse,
} from '@common/interfaces/delete-user.types';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class DeleteUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: DeleteUserPayload): Promise<DeleteUserResponse> {
    const { id } = command;

    try {
      const deletedUser = await this.userRepository.delete(id);

      return {
        id: deletedUser.id,
        message: 'User deleted successfully',
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
