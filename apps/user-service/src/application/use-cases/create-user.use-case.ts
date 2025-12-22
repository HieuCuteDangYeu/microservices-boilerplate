import { CreateUserPayloadDto } from '@common/user/dtos/create-user.dto';
import { Inject, Injectable } from '@nestjs/common';
import { UserAlreadyExistsError } from '@user/domain/errors/user-already-exists.error';
import * as bcrypt from 'bcrypt';
import { User } from '../../domain/entities/user.entity';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: CreateUserPayloadDto) {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new UserAlreadyExistsError(dto.email);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = new User(
      dto.id,
      dto.email,
      hashedPassword,
      'USER',
      new Date(),
    );

    await this.userRepository.save(newUser);

    return {
      id: newUser.id,
      email: newUser.email,
      message: 'User created successfully',
    };
  }
}
