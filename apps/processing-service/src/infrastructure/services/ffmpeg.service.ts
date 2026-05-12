import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Injectable } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

@Injectable()
export class FfmpegService {
  async transcodeToHls(inputPath: string, outputDir: string): Promise<void> {
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = `${outputDir}/stream.m3u8`;

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-profile:v baseline',
          '-level 3.0',
          '-start_number 0',
          '-hls_time 10',
          '-hls_list_size 0',
          '-f hls',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async extractAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp = '00:00:02',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(timestamp)
        .frames(1)
        .size('480x?')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }
}
