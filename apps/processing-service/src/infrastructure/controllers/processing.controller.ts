import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProcessReelUseCase } from '../../application/use-cases/process-reel.use-case';

@Controller()
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private readonly processReelUseCase: ProcessReelUseCase) {}

  @EventPattern('reel.created')
  async handleReelCreated(
    @Payload() data: { reelId: string; mediaKey: string; userId: string },
  ) {
    this.logger.log(
      `[Reel ${data.reelId}] Received reel.created event for ${data.mediaKey}`,
    );
    await this.processReelUseCase.execute(data);
  }
}
