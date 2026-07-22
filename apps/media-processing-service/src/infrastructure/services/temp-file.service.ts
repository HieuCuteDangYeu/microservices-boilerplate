import { Injectable } from '@nestjs/common';
import type {
  ChatVideoProcessingWorkspace,
  FileSystemPathStats,
  ITempFileService,
  ReelProcessingWorkspace,
} from '@processing/domain/interfaces/temp-file.service.interface';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

@Injectable()
export class TempFileService implements ITempFileService {
  createReelProcessingWorkspace(): ReelProcessingWorkspace {
    const workDir = path.join('/tmp', crypto.randomUUID());

    return {
      workDir,
      inputPath: path.join(workDir, 'input.mp4'),
      hlsOutputDir: path.join(workDir, 'hls'),
      audioOutputDir: path.join(workDir, 'transcription-audio'),
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

  getAvailableBytes(targetPath: string): number {
    const existingPath = fs.existsSync(targetPath)
      ? targetPath
      : path.dirname(targetPath);
    const stats = fs.statfsSync(existingPath);

    return stats.bavail * stats.bsize;
  }

  async getFileChecksum(targetPath: string): Promise<string> {
    const hash = crypto.createHash('sha256');

    await pipeline(fs.createReadStream(targetPath), hash);

    return hash.digest('hex');
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
