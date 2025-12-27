import { Inject, Injectable } from '@nestjs/common';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class AssignRoleUseCase {
  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
  ) {}

  async execute(userId: string, roleName: string): Promise<void> {
    await this.authRepository.assignRole(userId, roleName);
  }
}
