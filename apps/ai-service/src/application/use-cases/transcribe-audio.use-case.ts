import { Inject, Injectable } from '@nestjs/common';
import type { ITranscriptionService } from '../../domain/interfaces/transcription.service.interface';

@Injectable()
export class TranscribeAudioUseCase {
  constructor(
    @Inject('ITranscriptionService')
    private readonly transcriptionService: ITranscriptionService,
  ) {}

  async execute(audioBuffer: Buffer): Promise<string> {
    return await this.transcriptionService.transcribeAudio(audioBuffer);
  }
}
