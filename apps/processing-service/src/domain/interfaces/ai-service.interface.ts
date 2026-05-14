export interface IAiService {
  generateEmbedding(text: string): Promise<number[]>;
  transcribeAudio(audioBuffer: Buffer): Promise<string>;
}
