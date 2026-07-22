export interface ReelProcessingWorkspace {
  workDir: string;
  inputPath: string;
  hlsOutputDir: string;
  audioPath: string;
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

  readFile(path: string): Buffer;

  getPathStats(path: string): FileSystemPathStats;

  removeFileIfExists(path: string): void;

  removeDirIfExists(path: string): void;
}
