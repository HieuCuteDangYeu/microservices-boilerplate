import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { UserKeyBundle } from '../../domain/entities/user-key-bundle.entity';
import { PrismaKeyBundleRepository } from '../repositories/prisma-key-bundle.repository';

@Controller()
export class KeyMicroserviceController {
  constructor(private readonly keyRepo: PrismaKeyBundleRepository) {}

  // Client gọi lên để upload bộ key ban đầu
  @MessagePattern('upload_keys')
  async handleUploadKeys(@Payload() data: UserKeyBundle) {
    try {
      await this.keyRepo.storeKeyBundle(data);
      return { success: true };
    } catch (err: unknown) {
      const error = err as Error;
      throw new RpcException(error.message);
    }
  }

  // Client gọi lên để lấy key của người cần chat (để bắt tay X3DH)
  @MessagePattern('get_prekey_bundle')
  async handleGetPreKeyBundle(@Payload() data: { userId: string }) {
    try {
      const bundle = (await this.keyRepo.fetchKeyBundleForUser(
        data.userId,
      )) as UserKeyBundle | null;

      return bundle;
    } catch (err: unknown) {
      const error = err as Error;
      throw new RpcException(error.message);
    }
  }

  // Client kiểm tra xem mình còn bao nhiêu key để upload thêm
  @MessagePattern('count_prekeys')
  async handleCountPreKeys(@Payload() data: { userId: string }) {
    const count = await this.keyRepo.countPreKeys(data.userId);
    return { count };
  }
}
