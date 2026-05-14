export interface IAudioStorageService {
  downloadAudio(audioKey: string): Promise<Buffer>;
}
