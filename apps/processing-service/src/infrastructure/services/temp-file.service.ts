import { Injectable } from '@nestjs/common';
import type {
  ChatVideoProcessingWorkspace,
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
