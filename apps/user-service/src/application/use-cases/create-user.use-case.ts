import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { User } from '@user/domain/entities/user.entity';
import { RoleAssignmentError } from '@user/domain/errors/role-assignment.error';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import type { IAuthService } from '@user/domain/interfaces/auth-service.interface';
import * as bcrypt from 'bcrypt';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
    @Inject('IAuthService') private readonly authService: IAuthService,
  ) {}

  async execute(dto: CreateUserPayloadDto & { role?: string }) {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) throw new UserAlreadyExistsError(dto.email);

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(dto.email)}&background=random`;

    const newUser = new User(
      null,
      dto.email,
      hashedPassword,
      dto.isVerified ?? false,
      null,
      avatarUrl,
      null,
      null,
    );

    const savedUser = await this.userRepository.save(newUser);

    if (!savedUser.id) {
      throw new Error('Database failed to generate ID');
    }

    if (dto.role) {
      try {
        await this.authService.assignRole(savedUser.id, dto.role);
      } catch (error) {
        console.error(
          'Error assigning role, rolling back user creation:',
          error,
        );

        await this.userRepository.delete(savedUser.id);

        throw new RoleAssignmentError(savedUser.id);
      }
    }

    return {
      id: savedUser.id,
      email: savedUser.email,
      message: 'User created successfully',
    };
  }
}
