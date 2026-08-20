import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { AddReactionDto } from '@common/conversation/dtos/add-reaction.dto';
import { MessageReactionDetailsDto } from '@common/conversation/dtos/message-reaction-details.dto';
import { MessageDto } from '@common/conversation/dtos/message.dto';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  @Get(':messageId/reactions')
  @ApiOperation({ summary: 'List users who reacted to a message' })
  @ApiOkResponse({ type: MessageReactionDetailsDto })
  async getReactionDetails(
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageReactionDetailsDto> {
    const source$ = this.conversationClient.send('get_reaction_details', {
      messageId,
      userId: user.id,
    });

    return (await lastValueFrom(source$)) as MessageReactionDetailsDto;
  }

  @Post(':messageId/reactions')
  @ApiOperation({
    summary: 'Add or replace the current user reaction for a message',
  })
  @ApiBody({ type: AddReactionDto })
  @ApiOkResponse({ type: MessageDto })
  async addReaction(
    @Param('messageId') messageId: string,
    @Body() body: AddReactionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    const source$ = this.conversationClient.send('add_reaction', {
      messageId,
      userId: user.id,
      emoji: body.emoji,
    });

    return (await lastValueFrom(source$)) as MessageDto;
  }

  @Delete(':messageId/reactions/:userId')
  @ApiOperation({ summary: 'Remove the current user reaction from a message' })
  @ApiOkResponse({ type: MessageDto })
  async removeReaction(
    @Param('messageId') messageId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    if (userId !== user.id) {
      throw new ForbiddenException('You can only remove your own reaction');
    }

    const source$ = this.conversationClient.send('remove_reaction', {
      messageId,
      userId: user.id,
    });

    return (await lastValueFrom(source$)) as MessageDto;
  }
}
