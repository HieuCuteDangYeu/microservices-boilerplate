import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProcessReelUseCase } from '../../application/use-cases/process-reel.use-case';

@Controller()
export class ProcessingController {
  constructor(private readonly processReelUseCase: ProcessReelUseCase) {}

  @EventPattern('reel.created')
  async handleReelCreated(
    @Payload() data: { reelId: string; mediaKey: string; userId: string },
  ) {
    await this.processReelUseCase.execute(data);
  }
}
