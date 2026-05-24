import { Inject, Injectable } from '@nestjs/common';
import type { ITranscriptionService } from '../../domain/interfaces/transcription.service.interface';

@Injectable()
export class TranscribeAudioBufferUseCase {
  constructor(
    @Inject('ITranscriptionService')
    private readonly transcriptionService: ITranscriptionService,
  ) {}

  async execute(audioBase64: string): Promise<string> {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    return await this.transcriptionService.transcribeAudio(audioBuffer);
  }
}
