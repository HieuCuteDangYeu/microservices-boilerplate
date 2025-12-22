import { UserResponse } from '@common/user/interfaces/find-all-users.types';
import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/user-client';
import { User } from '../../domain/entities/user.entity';
import {
  FindAllParams,
  IUserRepository,
} from '../../domain/interfaces/user.repository.interface';
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

  async findAll(
    params: FindAllParams,
  ): Promise<{ users: UserResponse[]; total: number }> {
    const { skip, limit, search, sort } = params;

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [{ email: { contains: search, mode: 'insensitive' } }],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: {
          createdAt: sort || 'desc',
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
