export interface ReelProcessingWorkspace {
  workDir: string;
  inputPath: string;
  hlsOutputDir: string;
  audioOutputDir: string;
  thumbnailPath: string;
}

export interface ChatVideoProcessingWorkspace {
  workDir: string;
  inputPath: string;
  thumbnailPath: string;
}

export interface FileSystemPathStats {
  fileCount: number;
  totalBytes: number;
}

export interface ITempFileService {
  createReelProcessingWorkspace(): ReelProcessingWorkspace;

  createChatVideoProcessingWorkspace(): ChatVideoProcessingWorkspace;

  getPathStats(path: string): FileSystemPathStats;

  getAvailableBytes(path: string): number;

  getFileChecksum(path: string): Promise<string>;

  removeFileIfExists(path: string): void;

  removeDirIfExists(path: string): void;
}
