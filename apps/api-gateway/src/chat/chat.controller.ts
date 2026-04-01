import { AskAiDto } from '@common/chat/dto/ask-ai.dto';
import type { AuthenticatedRequest } from '@gateway/auth/guards/jwt-auth.guard';
import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Controller('chat')
export class ChatController {
  constructor(@Inject('AI_SERVICE') private readonly aiClient: ClientProxy) {}

  @Post()
  async askAi(@Body() body: AskAiDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;

    const reply = await lastValueFrom(
      this.aiClient.send<string>('ai.ask_question', {
        message: body.message,
        userId,
      }),
    );

    return {
      sender: 'Velora AI',
      message: reply,
    };
  }
}
