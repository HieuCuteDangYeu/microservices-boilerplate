import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

// 👇 IMPORT DTO
import { ConversationDto } from '@common/conversation/dtos/conversation.dto';
import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { MessageDto } from '@common/conversation/dtos/message.dto';
// 👇 THÊM IMPORT NÀY
import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationController {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  // --- 1. TẠO CUỘC HỘI THOẠI (MỚI THÊM) ---
  @Post()
  @ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })
  @ApiBody({ type: CreateConversationDto })
  @ApiOkResponse({ type: ConversationDto })
  async createConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationDto> {
    // Vì Interface khai báo user?, ta dùng dấu ! (non-null assertion)
    // vì @UseGuards đảm bảo code chạy tới đây thì user chắc chắn tồn tại.
    // const userId = user.id;

    // Logic add user hiện tại vào participants

    const payload = {
      ...body,
      creatorId: user.id, // 👈 3. QUAN TRỌNG: Gửi kèm ID chính chủ
    };

    const source$ = this.conversationClient.send(
      'create_conversation',
      payload,
    );
    return (await lastValueFrom(source$)) as ConversationDto;
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách hội thoại (Pagination)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  getMyConversations(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    const limitNumber = limit ? Number(limit) : 15;
    // Chuyển tiếp xuống Microservice
    return this.conversationClient.send('get_user_conversations', {
      userId: user.id,
      limit: limitNumber,
      cursor: cursor,
    });
  }

  // --- 2. LẤY LỊCH SỬ TIN NHẮN ---
  @Get(':id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn (Pagination)' })
  @ApiOkResponse({ type: [MessageDto] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String }) // 👈 Thêm document
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: number,
    @Query('cursor') cursor?: string, // 👈 Hứng cursor từ Frontend
  ): Promise<MessageDto[]> {
    const limitNumber = limit ? Number(limit) : 20;
    const source$ = this.conversationClient.send('get_messages', {
      conversationId,
      userId: user.id,
      limit: limitNumber,
      cursor: cursor, // 👈 Quan trọng: Truyền cursor đi
    });
    return (await lastValueFrom(source$)) as MessageDto[];
  }

  // --- 3. LẤY CHI TIẾT CONVERSATION ---
  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin cuộc hội thoại' })
  @ApiOkResponse({
    type: ConversationDto,
  })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationDto> {
    const source$ = this.conversationClient.send('get_conversation_detail', {
      id: id,
      userId: user.id,
    });
    return (await lastValueFrom(source$)) as ConversationDto;
  }

  // --- 4. GỬI TIN NHẮN (HTTP Fallback) ---
  @Post('message')
  @ApiOperation({ summary: 'Gửi tin nhắn (HTTP)' })
  @ApiBody({ type: CreateMessageDto })
  @ApiOkResponse({ type: MessageDto })
  async createMessage(
    @Body() body: CreateMessageDto,
    @CurrentUser() user: AuthUser, // 👈 Type safe hoàn toàn
  ): Promise<MessageDto> {
    // Lấy User từ request đã được Type

    const payload = {
      ...body,
      senderId: user.id,
    };

    const source$ = this.conversationClient.send('create_message', payload);
    return (await lastValueFrom(source$)) as MessageDto;
  }
}
