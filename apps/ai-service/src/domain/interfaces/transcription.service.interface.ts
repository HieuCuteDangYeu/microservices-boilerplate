import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';

export interface TranscriptionOptions {
  initialPrompt?: string;
}

export interface ITranscriptionService {
  transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
