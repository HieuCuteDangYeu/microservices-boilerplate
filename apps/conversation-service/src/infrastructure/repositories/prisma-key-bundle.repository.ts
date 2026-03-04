import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  OneTimePreKey,
  UserKeyBundle,
} from 'apps/conversation-service/src/domain/entities/user-key-bundle.entity';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaKeyBundleRepository {
  private readonly logger = new Logger(PrismaKeyBundleRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1. Upload Key Bundle (Lưu hoặc Cập nhật)
  async storeKeyBundle(bundle: UserKeyBundle): Promise<void> {
    try {
      await this.prisma.userKeyBundle.upsert({
        where: { userId: bundle.userId },
        update: {
          signedPreKey: bundle.signedPreKey,
          // Thêm các key mới vào danh sách hiện có
          oneTimePreKeys: {
            push: bundle.oneTimePreKeys,
          },
          updatedAt: new Date(),
        },
        create: {
          userId: bundle.userId,
          deviceId: bundle.deviceId,
          registrationId: bundle.registrationId,
          identityKey: bundle.identityKey,
          signedPreKey: bundle.signedPreKey,
          oneTimePreKeys: bundle.oneTimePreKeys,
        },
      });
      this.logger.log(`Stored key bundle for user ${bundle.userId}`);
    } catch (error) {
      this.logger.error(`Error storing key bundle: ${error.message}`);
      throw new InternalServerErrorException('Could not store key bundle');
    }
  }

  // 2. Fetch PreKey Bundle (Quan trọng: Lấy và Xóa 1 One-Time Key)
  async fetchKeyBundleForUser(targetUserId: string): Promise<any> {
    try {
      console.log(targetUserId);

      const bundle = await this.prisma.userKeyBundle.findUnique({
        where: { userId: targetUserId },
      });

      if (!bundle) {
        return null;
      }

      // 👇 FIX LỖI Ở ĐÂY: Logic lấy key an toàn hơn
      let preKey: OneTimePreKey | null = null; // Khai báo rõ kiểu để không bị lỗi "not assignable to null"

      if (bundle.oneTimePreKeys.length > 0) {
        // Lấy key đầu tiên
        const firstKey = bundle.oneTimePreKeys[0];
        preKey = firstKey;

        // Xóa key này khỏi DB
        await this.prisma.userKeyBundle.update({
          where: { userId: targetUserId },
          data: {
            oneTimePreKeys: {
              deleteMany: {
                // 👇 TypeScript sẽ không báo lỗi null nữa vì ta dùng biến tạm firstKey chắc chắn tồn tại
                where: { keyId: firstKey.keyId },
              },
            },
          },
        });
      }

      return {
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        registrationId: bundle.registrationId,
        preKey: preKey,
      };
    } catch (error) {
      this.logger.error(`Error fetching key bundle: ${error.message}`);
      throw new InternalServerErrorException('Could not fetch key bundle');
    }
  }

  // 3. Kiểm tra số lượng key còn lại
  async countPreKeys(userId: string): Promise<number> {
    const bundle = await this.prisma.userKeyBundle.findUnique({
      where: { userId },
      select: { oneTimePreKeys: true },
    });
    return bundle?.oneTimePreKeys?.length || 0;
  }
}
