import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { ProcessChatUseCase } from '../../application/use-cases/process-chat.use-case';
import { LlmUnavailableError } from '../../domain/errors/llm-unavailable.error';

@Controller()
export class AiController {
  constructor(private readonly processChatUseCase: ProcessChatUseCase) {}

  @MessagePattern('ai.ask_question')
  async handleQuestion(@Payload() data: { message: string; userId: string }) {
    try {
      return await this.processChatUseCase.execute(data.message, data.userId);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        throw new RpcException({
          statusCode: 503,
          message: error.message,
        });
      }
      throw new RpcException({
        statusCode: 500,
        message: 'Internal server error processing AI request',
      });
    }
  }
}
