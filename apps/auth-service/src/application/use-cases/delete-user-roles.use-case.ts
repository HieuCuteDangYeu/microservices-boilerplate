import { Inject, Injectable } from '@nestjs/common';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class DeleteUserRolesUseCase {
  constructor(
    @Inject('IAuthRepository')
    private readonly authRepository: IAuthRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.authRepository.rollbackRoles(userId);
  }
}
