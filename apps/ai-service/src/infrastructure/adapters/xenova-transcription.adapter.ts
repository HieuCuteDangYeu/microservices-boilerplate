import { Injectable, OnModuleInit } from '@nestjs/common';
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
  private transcriber: AutomaticSpeechRecognitionPipeline | null = null;

  async onModuleInit(): Promise<void> {
    this.transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
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

    const output = (await this.transcriber(audioData)) as unknown as
      | { text: string }
      | { text: string }[];

    return Array.isArray(output) ? output[0].text : output.text;
  }
}
