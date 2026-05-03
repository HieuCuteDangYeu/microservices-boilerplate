import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmService } from '../../domain/interfaces/llm.service.interface';

@Injectable()
export class GeminiLlmAdapter implements ILlmService {
  private readonly logger = new Logger(GeminiLlmAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async generateResponseStream(
    userMessage: string,
    systemInstruction: string,
    userId: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    try {
      this.logger.debug(`Streaming Gemini response for User [${userId}]`);

      const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
      const genAI = new GoogleGenerativeAI(apiKey);

      const generativeModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction,
      });

      const result = await generativeModel.generateContentStream(userMessage);
      let fullResponse = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          onToken(chunkText);
        }
      }

      this.logger.debug(`Successfully streamed response for User [${userId}]`);
      return fullResponse.trim();
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Gemini Streaming Error for User [${userId}]: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Unknown Gemini Streaming Error for User [${userId}]`,
        );
      }
      throw error;
    }
  }
}
