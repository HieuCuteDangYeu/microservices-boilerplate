import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type { IVisionService } from '@ai/domain/interfaces/vision.service.interface';
import type {
  AnalyzeVisualFrameRequest,
  VisualFrameAnalysis,
} from '@common/ai/interfaces/visual-analysis.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AnalyzeVisualFrameUseCase {
  constructor(
    @Inject('IVisionService')
    private readonly visionService: IVisionService,
    @Inject('IAiApplicationConfig')
    private readonly configService: IAiApplicationConfig,
  ) {}

  async execute(
    input: AnalyzeVisualFrameRequest,
  ): Promise<VisualFrameAnalysis> {
    const mimeType = input.mimeType ?? 'image/jpeg';
    const image = Buffer.from(input.imageBase64, 'base64');
    const maxBytes = this.getPositiveInt(
      'AI_VISION_MAX_IMAGE_BYTES',
      4 * 1024 * 1024,
      64 * 1024,
      20 * 1024 * 1024,
    );

    if (image.length === 0 || image.length > maxBytes) {
      throw new Error(
        `Visual frame payload must be between 1 and ${maxBytes} bytes`,
      );
    }

    return await this.visionService.analyzeImage({ image, mimeType });
  }

  private getPositiveInt(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.round(value)))
      : fallback;
  }
}
