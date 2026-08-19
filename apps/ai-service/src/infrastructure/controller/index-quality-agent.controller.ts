import { ReviewIndexQualityUseCase } from '@ai/application/use-cases/review-index-quality.use-case';
import type { IndexQualityReviewRequest } from '@common/ai/interfaces/index-quality-review.interface';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';

@Controller()
export class IndexQualityAgentController {
  constructor(private readonly reviewIndexQuality: ReviewIndexQualityUseCase) {}

  @MessagePattern('ai.review_index_quality')
  async handleReview(@Payload() input: IndexQualityReviewRequest) {
    if (
      !input ||
      typeof input.reelId !== 'string' ||
      !input.reelId.trim() ||
      !Array.isArray(input.documents)
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid index quality review payload',
      });
    }

    try {
      return await this.reviewIndexQuality.execute(input);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RpcException({ statusCode: 500, message });
    }
  }
}
