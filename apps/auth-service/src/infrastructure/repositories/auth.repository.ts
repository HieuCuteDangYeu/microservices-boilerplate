import { RefreshToken } from '@auth/domain/entities/refresh-token.entity';
import { Injectable } from '@nestjs/common';
import { RefreshToken as PrismaRefreshToken } from '@prisma/auth-client';
import { Role } from '../../domain/entities/role.entity';
import { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assignRole(userId: string, roleName: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role '${roleName}' not found in database.`);
    }

    await this.prisma.userRole.create({
      data: { userId, roleId: role.id },
    });

    return new Role(role.id, role.name);
  }

  async rollbackRoles(userId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });
  }

  async createRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    const savedToken: PrismaRefreshToken =
      await this.prisma.refreshToken.create({
        data: {
          userId,
          token,
          expiresAt,
          revoked: false,
        },
      });

    return new RefreshToken(
      savedToken.id,
      savedToken.userId,
      savedToken.token,
      savedToken.expiresAt,
      savedToken.revoked,
      savedToken.createdAt,
    );
  }

  async getUserRole(userId: string): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: userId },
      select: { role: true },
    });

    return roles.map((r) => r.role.name);
  }
}
