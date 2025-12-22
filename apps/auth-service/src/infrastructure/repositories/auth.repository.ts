import { Injectable } from '@nestjs/common';
import { Role } from '../../domain/entities/role.entity';
import { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assignRole(userId: string, roleName: string): Promise<Role> {
    const role = await this.prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

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
}
