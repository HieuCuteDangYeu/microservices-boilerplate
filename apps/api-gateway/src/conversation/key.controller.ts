import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import { UploadKeyBundleDto } from '@common/conversation/dtos/upload-key-bundle.dto';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger'; // Nếu dùng Swagger

@ApiTags('Signal Keys')
@Controller('keys')
@UseGuards(JwtAuthGuard)
export class GatewayKeyController {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  // 1. Upload Key Bundle (Khi user mới đăng ký hoặc cần bổ sung key)
  @Post()
  uploadKeys(@CurrentUser() user: any, @Body() dto: UploadKeyBundleDto) {
    // Ép userId từ token vào payload để bảo mật (không cho upload hộ người khác)
    const payload = { ...dto, userId: user.id };

    return this.conversationClient.send('upload_keys', payload);
  }

  // 2. Lấy Key Bundle của người khác (Để bắt đầu chat E2EE)
  @Get(':userId')
  getPreKeyBundle(@Param('userId') targetUserId: string) {
    return this.conversationClient.send('get_prekey_bundle', {
      userId: targetUserId,
    });
  }

  // 3. Kiểm tra xem mình còn bao nhiêu key (để Client biết đường upload thêm)
  @Get('me/count')
  countMyKeys(@CurrentUser() user: any) {
    return this.conversationClient.send('count_prekeys', { userId: user.id });
  }
}
