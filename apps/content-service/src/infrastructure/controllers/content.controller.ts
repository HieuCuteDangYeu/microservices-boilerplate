import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { CreateReelUseCase } from '../../application/use-cases/create-reel.use-case';

@Controller()
export class ContentController {
  constructor(private readonly createReelUseCase: CreateReelUseCase) {}

  @MessagePattern('content.create_reel')
  async createReel(
    @Payload() data: { userId: string; payload: CreateReelDto },
  ) {
    try {
      return await this.createReelUseCase.execute(data.userId, data.payload);
    } catch (error) {
      throw new RpcException(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while creating the reel',
      );
    }
  }
}
