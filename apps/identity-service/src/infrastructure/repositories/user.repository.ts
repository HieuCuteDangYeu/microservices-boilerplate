import { Injectable } from '@nestjs/common';
import { User as PrismaUser } from '@prisma/identity-client';
import { User } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/interfaces/user.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(user: User): Promise<User> {
    const saved = await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        password: user.password,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
    return this.toDomain(saved);
  }

  async findByEmail(email: string): Promise<User | null> {
    const found = await this.prisma.user.findUnique({ where: { email } });
    return found ? this.toDomain(found) : null;
  }

  private toDomain(prismaUser: PrismaUser): User {
    return new User(
      prismaUser.id,
      prismaUser.email,
      prismaUser.password,
      prismaUser.role,
      prismaUser.createdAt,
    );
  }
}
