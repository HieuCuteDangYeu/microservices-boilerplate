import { GoogleGenerativeAI } from '@google/generative-ai';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmUnavailableError } from '../../domain/errors/llm-unavailable.error';
import type { IContentService } from '../../domain/interfaces/content.service.interface';
import type { IConversationService } from '../../domain/interfaces/conversation.service.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';
import { checkReelStatusTool, getRecentMessagesTool } from '../ai/gemini-tools';

@Injectable()
export class GeminiLlmAdapter implements ILlmService {
  private ai: GoogleGenerativeAI;

  constructor(
    private readonly configService: ConfigService,
    @Inject('IContentService') private readonly contentService: IContentService,
    @Inject('IConversationService')
    private readonly conversationService: IConversationService,
  ) {
    this.ai = new GoogleGenerativeAI(
      this.configService.getOrThrow('GEMINI_API_KEY'),
    );
  }

  async generateResponse(
    userMessage: string,
    context: string,
    userId: string,
  ): Promise<string> {
    const model = this.ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [
        { functionDeclarations: [checkReelStatusTool, getRecentMessagesTool] },
      ],
      systemInstruction: `You are the Velora AI Assistant. Answer using these rules:\n${context}`,
    });

    const chat = model.startChat();

    try {
      let result = await chat.sendMessage(userMessage);
      let calls = result.response.functionCalls();

      while (calls && calls.length > 0) {
        const call = calls[0];
        let functionResponseData: unknown;

        if (call.name === 'check_reel_status') {
          const { reelId } = call.args as { reelId: string };
          functionResponseData =
            await this.contentService.getReelStatus(reelId);
        } else if (call.name === 'get_recent_messages') {
          const { conversationId, limit } = call.args as {
            conversationId: string;
            limit?: number;
          };
          functionResponseData =
            await this.conversationService.getRecentMessages(
              conversationId,
              userId,
              limit,
            );
        }

        result = await chat.sendMessage([
          {
            functionResponse: {
              name: call.name,
              response: functionResponseData as object,
            },
          },
        ]);

        calls = result.response.functionCalls();
      }

      return result.response.text();
    } catch (error) {
      const e = error as { status?: number };
      if (e.status === 503) {
        throw new LlmUnavailableError();
      }
      throw error;
    }
  }
}
