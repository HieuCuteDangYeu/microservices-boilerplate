import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  buildUsernameCandidate,
  buildUsernameBase,
  deriveFullName,
  normalizeFullName,
  normalizeUsername,
} from '@user/application/utils/public-identity.utils';
import { User } from '@user/domain/entities/user.entity';
import { RoleAssignmentError } from '@user/domain/errors/role-assignment.error';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import { UsernameAlreadyTakenError } from '@user/domain/errors/username-already-taken.error';
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

    if (existing) {
      throw new UserAlreadyExistsError(dto.email);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const fullName = dto.fullName
      ? normalizeFullName(dto.fullName)
      : deriveFullName(dto.email);
    const username = dto.username
      ? await this.ensureExplicitUsername(dto.username)
      : await this.generateUsername(fullName, dto.email);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`;

    const newUser = new User(
      null,
      dto.email,
      fullName,
      username,
      hashedPassword,
      dto.isVerified ?? false,
      null,
      avatarUrl,
      null,
      null,
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

        if (target.includes('username')) {
          throw new UsernameAlreadyTakenError(username);
        }
      }

      throw error;
    }

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
      fullName: savedUser.fullName,
      username: savedUser.username,
      message: 'User created successfully',
    };
  }

  private async ensureExplicitUsername(username: string): Promise<string> {
    const normalizedUsername = normalizeUsername(username);
    const isAvailable =
      await this.userRepository.isUsernameAvailable(normalizedUsername);

    if (!isAvailable) {
      throw new UsernameAlreadyTakenError(normalizedUsername);
    }

    return normalizedUsername;
  }

  private async generateUsername(
    fullName: string,
    email: string,
  ): Promise<string> {
    const base = buildUsernameBase(fullName || email.split('@')[0] || 'user');

    if (await this.userRepository.isUsernameAvailable(base)) {
      return base;
    }

    const emailBase = buildUsernameBase(email.split('@')[0] || base);

    if (
      emailBase !== base &&
      (await this.userRepository.isUsernameAvailable(emailBase))
    ) {
      return emailBase;
    }

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = buildUsernameCandidate(base, attempt);

      if (await this.userRepository.isUsernameAvailable(candidate)) {
        return candidate;
      }
    }

    return buildUsernameCandidate(base, Date.now().toString().slice(-6));
  }
}
