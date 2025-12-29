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
        email: user.email,
        password: user.password,
        isVerified: user.isVerified,
        picture: user.picture,
        provider: user.provider,
        providerId: user.providerId,
      },
    });
    return this.toDomain(saved);
  }

  async findByEmail(email: string): Promise<User | null> {
    const found = await this.prisma.user.findUnique({ where: { email } });
    return found ? this.toDomain(found) : null;
  }

  async findById(id: string): Promise<User | null> {
    const found = await this.prisma.user.findUnique({
      where: { id },
    });
    return found ? this.toDomain(found) : null;
  }

  private toDomain(prismaUser: PrismaUser): User {
    return new User(
      prismaUser.id,
      prismaUser.email,
      prismaUser.password,
      prismaUser.isVerified,
      prismaUser.createdAt,
      prismaUser.picture,
      prismaUser.provider,
      prismaUser.providerId,
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
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _date, ...cleanData } = data;

    const updated = await this.prisma.user.update({
      where: { id },
      data: cleanData,
    });

    return this.toDomain(updated);
  }

  async delete(id: string): Promise<User> {
    const deleted = await this.prisma.user.delete({
      where: { id },
    });

    return this.toDomain(deleted);
  }
}
