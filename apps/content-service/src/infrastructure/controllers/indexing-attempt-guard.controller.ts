import { IsReelIndexingAttemptCurrentUseCase } from '@content/application/use-cases/is-reel-indexing-attempt-current.use-case';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class IndexingAttemptGuardController {
  constructor(
    private readonly isReelIndexingAttemptCurrentUseCase: IsReelIndexingAttemptCurrentUseCase,
  ) {}

  @MessagePattern('content.is_reel_indexing_attempt_current')
  async isReelIndexingAttemptCurrent(
    @Payload()
    data: {
      reelId: string;
      indexAttemptId: string;
    },
  ): Promise<boolean> {
    return await this.isReelIndexingAttemptCurrentUseCase.execute(data);
  }
}
