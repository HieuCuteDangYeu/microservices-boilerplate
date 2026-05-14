export interface IAiService {
  generateEmbedding(text: string): Promise<number[]>;
  transcribeAudio(audioKey: string): Promise<string>;
}
