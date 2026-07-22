import { Injectable } from '@nestjs/common';
import type {
  ChatVideoProcessingWorkspace,
  FileSystemPathStats,
  ITempFileService,
  ReelProcessingWorkspace,
} from '@processing/domain/interfaces/temp-file.service.interface';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TempFileService implements ITempFileService {
  createReelProcessingWorkspace(): ReelProcessingWorkspace {
    const workDir = path.join('/tmp', crypto.randomUUID());

    return {
      workDir,
      inputPath: path.join(workDir, 'input.mp4'),
      hlsOutputDir: path.join(workDir, 'hls'),
      audioPath: path.join(workDir, 'audio.wav'),
      thumbnailPath: path.join(workDir, 'thumbnail.jpg'),
    };
  }

  createChatVideoProcessingWorkspace(): ChatVideoProcessingWorkspace {
    const workDir = path.join('/tmp', `chat-media-${crypto.randomUUID()}`);

    return {
      workDir,
      inputPath: path.join(workDir, 'input-video'),
      thumbnailPath: path.join(workDir, 'thumbnail.jpg'),
    };
  }

  readFile(path: string): Buffer {
    return fs.readFileSync(path);
  }

  getPathStats(targetPath: string): FileSystemPathStats {
    if (!fs.existsSync(targetPath)) {
      return { fileCount: 0, totalBytes: 0 };
    }

    const stats = fs.statSync(targetPath);

    if (stats.isFile()) {
      return { fileCount: 1, totalBytes: stats.size };
    }

    if (!stats.isDirectory()) {
      return { fileCount: 0, totalBytes: 0 };
    }

    return fs.readdirSync(targetPath, { withFileTypes: true }).reduce(
      (total, entry) => {
        const entryStats = this.getPathStats(path.join(targetPath, entry.name));
        return {
          fileCount: total.fileCount + entryStats.fileCount,
          totalBytes: total.totalBytes + entryStats.totalBytes,
        };
      },
      { fileCount: 0, totalBytes: 0 },
    );
  }

  removeFileIfExists(path: string): void {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  }

  removeDirIfExists(path: string): void {
    if (fs.existsSync(path)) {
      fs.rmSync(path, { recursive: true, force: true });
    }
  }
}
