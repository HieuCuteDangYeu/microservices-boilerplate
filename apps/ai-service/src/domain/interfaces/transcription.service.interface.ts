export interface ITranscriptionService {
  transcribeAudio(audioBuffer: Buffer): Promise<string>;
}
