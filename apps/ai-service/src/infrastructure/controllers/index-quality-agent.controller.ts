import { ReviewIndexQualityUseCase } from '@ai/application/use-cases/review-index-quality.use-case';
import { IndexQualityReviewSchema } from '@common/ai/dtos/index-quality-review.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';

@Controller()
export class IndexQualityAgentController {
  constructor(private readonly reviewIndexQuality: ReviewIndexQualityUseCase) {}

  @MessagePattern('ai.review_index_quality')
  async handleReview(@Payload() input: unknown) {
    const parsed = IndexQualityReviewSchema.safeParse(input);
    if (!parsed.success) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid index quality review payload',
      });
    }

    try {
      return await this.reviewIndexQuality.execute(parsed.data);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new RpcException({ statusCode: 500, message });
    }
  }
}
