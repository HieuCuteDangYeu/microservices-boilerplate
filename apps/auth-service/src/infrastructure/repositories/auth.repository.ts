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

  async findRefreshToken(token: string): Promise<RefreshToken | null> {
    const found = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!found) return null;

    return new RefreshToken(
      found.id,
      found.userId,
      found.token,
      found.expiresAt,
      found.revoked,
      found.createdAt,
    );
  }

  async updateRefreshToken(
    id: string,
    data: Partial<RefreshToken>,
  ): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revoked: data.revoked,
      },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async deleteExpiredAndRevokedTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        AND: [{ revoked: true }, { expiresAt: { lt: new Date() } }],
      },
    });

    return result.count;
  }
}
