import { BOT_USER_ID } from '@common/constants/seed.constants';
import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { ChatWithBotDto } from '@common/conversation/dtos/chat-with-bot.dto';
import { ConversationDto } from '@common/conversation/dtos/conversation.dto';
import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { MessageDto } from '@common/conversation/dtos/message.dto';
import { CreateMessageResponse } from '@common/conversation/interfaces/create-message-response.interface';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
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

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationController {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string }> {
    return await lastValueFrom(
      this.conversationClient.send<{ id: string }>('create_conversation', {
        ...body,
        creatorId: user.id,
      }),
    );
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
    return this.conversationClient.send('get_user_conversations', {
      userId: user.id,
      limit: limit ? Number(limit) : 15,
      cursor,
    });
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn (Pagination)' })
  @ApiOkResponse({ type: [MessageDto] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<MessageDto[]> {
    return await lastValueFrom(
      this.conversationClient.send<MessageDto[]>('get_messages', {
        conversationId,
        userId: user.id,
        limit: limit ? Number(limit) : 20,
        cursor,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin cuộc hội thoại' })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationDto> {
    return await lastValueFrom(
      this.conversationClient.send<ConversationDto>('get_conversation_detail', {
        id,
        userId: user.id,
      }),
    );
  }

  @Post('message')
  @ApiOperation({ summary: 'Gửi tin nhắn (HTTP)' })
  @ApiBody({ type: CreateMessageDto })
  @ApiOkResponse({ type: MessageDto })
  async createMessage(
    @Body() body: CreateMessageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    const response = await lastValueFrom(
      this.conversationClient.send<CreateMessageResponse>('create_message', {
        ...body,
        senderId: user.id,
      }),
    );
    return response.message;
  }

  @Post('chat')
  @ApiOperation({
    summary:
      'Chat with AI Bot — creates/finds bot conversation then sends message. Bot reply comes via WebSocket.',
  })
  @ApiBody({ type: ChatWithBotDto })
  @ApiOkResponse({ type: MessageDto })
  async chatWithBot(
    @Body() body: ChatWithBotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    const botParticipantId = BOT_USER_ID;

    const convResult = await lastValueFrom(
      this.conversationClient.send<{ id: string }>('create_conversation', {
        participantIds: [user.id, botParticipantId],
        isGroup: false,
      }),
    );

    const messageResponse = await lastValueFrom(
      this.conversationClient.send<CreateMessageResponse>('create_message', {
        content: body.content,
        type: body.type,
        signalType: body.signalType,
        registrationId: body.registrationId,
        conversationId: convResult.id,
        senderId: user.id,
      }),
    );

    return messageResponse.message;
  }
}
