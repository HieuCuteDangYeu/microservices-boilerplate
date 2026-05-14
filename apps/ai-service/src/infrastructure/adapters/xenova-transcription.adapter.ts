import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
} from '@xenova/transformers';
import { WaveFile } from 'wavefile';
import type { ITranscriptionService } from '../../domain/interfaces/transcription.service.interface';

@Injectable()
export class XenovaTranscriptionAdapter
  implements ITranscriptionService, OnModuleInit
{
  private readonly logger = new Logger(XenovaTranscriptionAdapter.name);
  private transcriber: AutomaticSpeechRecognitionPipeline | null = null;
  private readonly chunkLengthSeconds: number;
  private readonly strideLengthSeconds: number;

  constructor(private readonly config: ConfigService) {
    const configuredChunkLengthSeconds = Number(
      this.config.get<string>('WHISPER_CHUNK_LENGTH_S') ?? '30',
    );
    const configuredStrideLengthSeconds = Number(
      this.config.get<string>('WHISPER_STRIDE_LENGTH_S') ?? '5',
    );
    this.chunkLengthSeconds =
      Number.isFinite(configuredChunkLengthSeconds) &&
      configuredChunkLengthSeconds > 0
        ? configuredChunkLengthSeconds
        : 30;
    this.strideLengthSeconds =
      Number.isFinite(configuredStrideLengthSeconds) &&
      configuredStrideLengthSeconds >= 0
        ? configuredStrideLengthSeconds
        : 5;
  }

  async onModuleInit(): Promise<void> {
    const model = this.config.get<string>(
      'WHISPER_MODEL',
      'Xenova/whisper-base',
    );
    const startedAt = Date.now();
    this.logger.log(`Initializing transcription model ${model}`);
    this.transcriber = await pipeline('automatic-speech-recognition', model);
    this.logger.log(
      `Initialized transcription model ${model} in ${Date.now() - startedAt}ms`,
    );
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    if (!this.transcriber) {
      throw new Error('Transcription model has not been initialized');
    }

    const wav = new WaveFile(audioBuffer);

    wav.toBitDepth('32f');
    wav.toSampleRate(16000);

    let audioData = wav.getSamples() as unknown as
      | Float32Array
      | Float64Array
      | Array<Float32Array | Float64Array>;

    if (Array.isArray(audioData)) {
      if (audioData.length > 1) {
        const left = audioData[0];
        const right = audioData[1];

        if (left && right) {
          const SCALING_FACTOR = Math.sqrt(2);
          const mono = new Float32Array(left.length);

          for (let i = 0; i < left.length; ++i) {
            mono[i] = SCALING_FACTOR * (left[i] / 2 + right[i] / 2);
          }
          audioData = mono;
        } else {
          audioData = left || new Float32Array(0);
        }
      } else {
        audioData = audioData[0] || new Float32Array(0);
      }
    }

    const audioDurationSeconds =
      audioData instanceof Float32Array || audioData instanceof Float64Array
        ? Math.round(audioData.length / 16000)
        : 0;
    const startedAt = Date.now();

    const output = (await this.transcriber(audioData, {
      chunk_length_s: this.chunkLengthSeconds,
      stride_length_s: this.strideLengthSeconds,
    })) as unknown as
      | { text: string }
      | { text: string }[];

    this.logger.log(
      `Transcribed ${audioDurationSeconds}s audio in ${Date.now() - startedAt}ms`,
    );

    return Array.isArray(output) ? output[0].text : output.text;
  }
}
