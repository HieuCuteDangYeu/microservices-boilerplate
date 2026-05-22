import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Injectable } from '@nestjs/common';
import { accessSync, constants } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { delimiter, join } from 'path';

const canExecute = (binaryPath: string) => {
  try {
    accessSync(binaryPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const findBinaryOnPath = (binaryName: string) => {
  const executableName =
    process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
  const pathValue = process.env.PATH;

  if (!pathValue) {
    return undefined;
  }

  for (const directory of pathValue.split(delimiter)) {
    const candidatePath = join(directory, executableName);

    if (canExecute(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
};

const resolveBinaryPath = (
  binaryName: 'ffmpeg' | 'ffprobe',
  packagedPath: string,
) => {
  const overrideEnvVar =
    binaryName === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  const configuredPath = process.env[overrideEnvVar];

  if (configuredPath && canExecute(configuredPath)) {
    return configuredPath;
  }

  if (canExecute(packagedPath)) {
    return packagedPath;
  }

  const systemPath = findBinaryOnPath(binaryName);

  if (systemPath) {
    return systemPath;
  }

  throw new Error(
    `${binaryName} binary is not executable. Set ${overrideEnvVar} or install ${binaryName} in the runtime image.`,
  );
};

const ffmpegPath = resolveBinaryPath('ffmpeg', ffmpegInstaller.path);
const ffprobePath = resolveBinaryPath('ffprobe', ffprobeInstaller.path);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

interface VideoMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
}

@Injectable()
export class VideoProcessingService {
  async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp = '00:00:00.500',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(timestamp)
        .frames(1)
        .size('640x?')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        const videoStream = metadata.streams.find(
          (stream) => stream.codec_type === 'video',
        );

        const durationSeconds =
          typeof metadata.format?.duration === 'number'
            ? metadata.format.duration
            : undefined;

        resolve({
          durationMs:
            durationSeconds !== undefined
              ? Math.max(0, Math.round(durationSeconds * 1000))
              : undefined,
          width:
            typeof videoStream?.width === 'number'
              ? videoStream.width
              : undefined,
          height:
            typeof videoStream?.height === 'number'
              ? videoStream.height
              : undefined,
        });
      });
    });
  }
}
