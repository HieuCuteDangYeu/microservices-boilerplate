import { User as PrismaUser } from '@prisma/user-client';
import { User } from '@user/domain/entities/user.entity';

export class UserPrismaMapper {
  static toDomain(raw: PrismaUser): User {
    const cdnDomain = process.env.R2_PUBLIC_DOMAIN;
    let computedPicture: string | null = null;

    if (raw.avatarKey) {
      if (raw.avatarKey.startsWith('http')) {
        computedPicture = raw.avatarKey;
      } else {
        computedPicture = `${cdnDomain}/${raw.avatarKey}`;
      }
    }

    return new User(
      raw.id,
      raw.email,
      raw.password,
      raw.isVerified,
      raw.createdAt,
      computedPicture,
      raw.provider,
      raw.providerId,
    );
  }
}
