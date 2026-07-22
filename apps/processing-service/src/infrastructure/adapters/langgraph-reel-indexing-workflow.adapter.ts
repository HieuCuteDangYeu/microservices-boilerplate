import { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import {
  TranscriptionResult,
  TranscriptSegment,
} from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { BuiltTranscriptChunk } from '@common/conversation/interfaces/built-transcript-chunk.interface';
import type { ReelPipelineMetricContext } from '@common/processing/interfaces/reel-pipeline-metric.interface';
import { END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuildReelTranscriptionPromptUseCase } from '@processing/application/use-cases/build-reel-transcription-prompt.use-case';
import { BuildTranscriptChunksUseCase } from '@processing/application/use-cases/build-transcript-chunks.use-case';
import type { TranscriptChunkBuildMetrics } from '@processing/application/use-cases/build-transcript-chunks.use-case';
import {
  EmbedReelChunksUseCase,
  ReelChunkEmbeddingMetrics,
} from '@processing/application/use-cases/embed-reel-chunks.use-case';
import {
  NormalizedReelMetadata,
  NormalizeReelMetadataUseCase,
} from '@processing/application/use-cases/normalize-reel-metadata.use-case';
import {
  ReelIndexValidationResult,
  ValidateReelIndexUseCase,
} from '@processing/application/use-cases/validate-reel-index.use-case';
import { formatProcessingError } from '@processing/application/utils/format-processing-error';
import type { IAiService } from '@processing/domain/interfaces/ai-service.interface';
import type { IProcessingMetrics } from '@processing/domain/interfaces/processing-metrics.interface';
import type {
  IReelIndexingWorkflow,
  ReelIndexingWorkflowInput,
  ReelIndexingWorkflowResult,
  ReelIndexingWorkflowTraceStep,
} from '@processing/domain/interfaces/reel-indexing-workflow.interface';
import type { ITempFileService } from '@processing/domain/interfaces/temp-file.service.interface';
import type { IVideoProcessingService } from '@processing/domain/interfaces/video-processing.service.interface';
import { z } from 'zod/v4';

interface ReelIndexingWorkflowState {
  reelId: string;
  title?: string;
  description?: string;
  tags?: string[];
  inputPath: string;
  audioPath: string;

  transcription?: TranscriptionResult;
  transcript?: string;
  transcriptVtt?: string;
  transcriptSegments?: TranscriptSegment[];

  extractedMetadata?: ExtractedReelMetadata;
  normalizedMetadata?: NormalizedReelMetadata;

  builtChunks: BuiltTranscriptChunk[];
  indexedChunks: ReelChunkIndexInput[];

  validation?: ReelIndexValidationResult;
  chunkBuildMetrics?: TranscriptChunkBuildMetrics;
  chunkEmbeddingMetrics?: ReelChunkEmbeddingMetrics;

  trace: ReelIndexingWorkflowTraceStep[];
}

const ReelIndexingStateSchema = new StateSchema({
  reelId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  inputPath: z.string(),
  audioPath: z.string(),

  transcription: z.any().optional(),
  transcript: z.string().optional(),
  transcriptVtt: z.string().optional(),
  transcriptSegments: z.array(z.any()).optional(),

  extractedMetadata: z.any().optional(),
  normalizedMetadata: z.any().optional(),

  builtChunks: z.array(z.any()).default([]),
  indexedChunks: z.array(z.any()).default([]),

  validation: z.any().optional(),
  chunkBuildMetrics: z.any().optional(),
  chunkEmbeddingMetrics: z.any().optional(),

  trace: z.array(z.any()).default([]),
});

@Injectable()
export class LangGraphReelIndexingWorkflowAdapter implements IReelIndexingWorkflow {
  private readonly logger = new Logger(
    LangGraphReelIndexingWorkflowAdapter.name,
  );

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
    @Inject('IVideoProcessingService')
    private readonly videoProcessingService: IVideoProcessingService,
    @Inject('ITempFileService')
    private readonly tempFileService: ITempFileService,
    @Inject('IProcessingMetrics')
    private readonly processingMetrics: IProcessingMetrics,
    private readonly buildReelTranscriptionPromptUseCase: BuildReelTranscriptionPromptUseCase,
    private readonly normalizeReelMetadataUseCase: NormalizeReelMetadataUseCase,
    private readonly buildTranscriptChunksUseCase: BuildTranscriptChunksUseCase,
    private readonly embedReelChunksUseCase: EmbedReelChunksUseCase,
    private readonly validateReelIndexUseCase: ValidateReelIndexUseCase,
  ) {}

  async execute(
    input: ReelIndexingWorkflowInput,
  ): Promise<ReelIndexingWorkflowResult> {
    const nodeTimings: Record<string, number> = {};
    const graph = this.buildGraph(nodeTimings, input.metricsContext);
    const totalTimer = this.processingMetrics.startStage(
      input.metricsContext,
      'TOTAL_INDEXING',
    );

    const initialState: ReelIndexingWorkflowState = {
      reelId: input.reelId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      inputPath: input.inputPath,
      audioPath: input.audioPath,
      builtChunks: [],
      indexedChunks: [],
      trace: [],
    };

    let result: ReelIndexingWorkflowState;

    try {
      const rawResult: unknown = await graph.invoke(initialState);
      result = this.toWorkflowState(rawResult, initialState);
      totalTimer.succeed({
        semanticUnitCount: result.chunkBuildMetrics?.semanticUnitCount ?? 0,
        finalChunkCount: result.chunkBuildMetrics?.finalChunkCount ?? 0,
        embeddingRequestCount:
          (result.chunkBuildMetrics?.semanticEmbeddingRequestCount ?? 0) +
          (result.chunkEmbeddingMetrics?.requestCount ?? 0),
        embeddingTotalItemCount:
          (result.chunkBuildMetrics?.semanticEmbeddingRequestCount ?? 0) +
          (result.chunkEmbeddingMetrics?.totalItemCount ?? 0),
      });
    } catch (error: unknown) {
      totalTimer.fail('INDEXING_WORKFLOW');
      throw error;
    }

    const normalizedMetadata = result.normalizedMetadata;

    return {
      title: normalizedMetadata?.title,
      description: normalizedMetadata?.description,
      tags:
        normalizedMetadata?.tags && normalizedMetadata.tags.length > 0
          ? normalizedMetadata.tags
          : undefined,
      transcript: result.transcript,
      transcriptVtt: result.transcriptVtt,
      transcriptSegments: result.transcriptSegments,
      chunks:
        result.indexedChunks.length > 0 ? result.indexedChunks : undefined,
      trace: result.trace,
      nodeTimings,
    };
  }

  private buildGraph(
    nodeTimings: Record<string, number>,
    metricsContext: ReelPipelineMetricContext,
  ) {
    return new StateGraph(ReelIndexingStateSchema)
      .addNode(
        'transcriptionNode',
        this.createTranscriptionNode(nodeTimings, metricsContext),
      )
      .addNode(
        'metadataExtractionNode',
        this.createMetadataExtractionNode(nodeTimings, metricsContext),
      )
      .addNode('normalizationNode', this.createNormalizationNode(nodeTimings))
      .addNode(
        'chunkingNode',
        this.createChunkingNode(nodeTimings, metricsContext),
      )
      .addNode(
        'embeddingNode',
        this.createEmbeddingNode(nodeTimings, metricsContext),
      )
      .addNode('validationNode', this.createValidationNode(nodeTimings))

      .addEdge(START, 'transcriptionNode')
      .addEdge('transcriptionNode', 'metadataExtractionNode')
      .addEdge('metadataExtractionNode', 'normalizationNode')
      .addEdge('normalizationNode', 'chunkingNode')
      .addEdge('chunkingNode', 'embeddingNode')
      .addEdge('embeddingNode', 'validationNode')
      .addEdge('validationNode', END)

      .compile();
  }

  private createTranscriptionNode(
    nodeTimings: Record<string, number>,
    metricsContext: ReelPipelineMetricContext,
  ) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('transcriptionNode', nodeTimings, async () => {
        try {
          const transcription = await this.withRetry(
            'transcriptionNode',
            2,
            async (attempt) => {
              const retryNumber = attempt - 1;
              const audioTimer = this.processingMetrics.startStage(
                metricsContext,
                'AUDIO_EXTRACTION',
                { retryNumber },
              );

              try {
                await this.videoProcessingService.extractAudioForTranscription(
                  state.inputPath,
                  state.audioPath,
                );

                const audioStats = this.tempFileService.getPathStats(
                  state.audioPath,
                );
                audioTimer.succeed({
                  retryNumber,
                  audioArtifactBytes: audioStats.totalBytes,
                });
              } catch (error: unknown) {
                audioTimer.fail('AUDIO_EXTRACTION', { retryNumber });
                throw error;
              }

              const audioBuffer = this.tempFileService.readFile(
                state.audioPath,
              );
              const transcriptionPayload = {
                audioBase64BytesEstimate: Math.ceil(
                  (audioBuffer.byteLength * 4) / 3,
                ),
                initialPrompt:
                  this.buildReelTranscriptionPromptUseCase.execute(state),
              };
              const transcriptionTimer = this.processingMetrics.startStage(
                metricsContext,
                'TRANSCRIPTION',
                { retryNumber },
              );

              try {
                const result = await this.aiService.transcribeAudio(
                  audioBuffer,
                  {
                    initialPrompt: transcriptionPayload.initialPrompt,
                  },
                );
                transcriptionTimer.succeed({
                  retryNumber,
                  audioArtifactBytes: audioBuffer.byteLength,
                  rabbitMqPayloadBytesEstimate:
                    transcriptionPayload.audioBase64BytesEstimate +
                    Buffer.byteLength(transcriptionPayload.initialPrompt),
                  transcriptChars: result.text?.length ?? 0,
                  transcriptSegmentCount: result.segments?.length ?? 0,
                });
                return result;
              } catch (error: unknown) {
                transcriptionTimer.fail('TRANSCRIPTION', { retryNumber });
                throw error;
              }
            },
          );

          const transcript = transcription.text?.trim() || undefined;
          const transcriptVtt = transcription.vtt?.trim() || undefined;
          const transcriptSegments =
            transcription.segments && transcription.segments.length > 0
              ? transcription.segments
              : undefined;

          this.logger.log(
            `[Reel ${state.reelId}] Transcription completed chars=${
              transcript?.length ?? 0
            } segments=${transcriptSegments?.length ?? 0}`,
          );

          return {
            transcription,
            transcript,
            transcriptVtt,
            transcriptSegments,
            trace: this.appendTrace(state, {
              node: 'transcriptionNode',
              status: 'SUCCESS',
              message: `chars=${transcript?.length ?? 0}`,
            }),
          };
        } catch (error: unknown) {
          const { message, stack } = formatProcessingError(error);

          this.logger.warn(
            `[Reel ${state.reelId}] Transcription failed, fallback to metadata-only indexing if possible: ${message}`,
            stack,
          );

          return {
            trace: this.appendTrace(state, {
              node: 'transcriptionNode',
              status: 'FALLBACK',
              message,
            }),
          };
        } finally {
          this.tempFileService.removeFileIfExists(state.audioPath);
        }
      });
    };
  }

  private createMetadataExtractionNode(
    nodeTimings: Record<string, number>,
    metricsContext: ReelPipelineMetricContext,
  ) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('metadataExtractionNode', nodeTimings, async () => {
        try {
          const extractedMetadata = await this.withRetry(
            'metadataExtractionNode',
            2,
            async (attempt) => {
              const retryNumber = attempt - 1;
              const payload = {
                title: state.title,
                description: state.description,
                tags: state.tags,
                transcript: state.transcript,
                maxTags: 8,
              };
              const timer = this.processingMetrics.startStage(
                metricsContext,
                'METADATA_EXTRACTION',
                { retryNumber },
              );

              try {
                const result =
                  await this.aiService.extractReelMetadata(payload);
                timer.succeed({
                  retryNumber,
                  rabbitMqPayloadBytesEstimate:
                    this.processingMetrics.estimatePayloadBytes(payload),
                });
                return result;
              } catch (error: unknown) {
                timer.fail('METADATA_EXTRACTION', { retryNumber });
                throw error;
              }
            },
          );

          return {
            extractedMetadata,
            trace: this.appendTrace(state, {
              node: 'metadataExtractionNode',
              status: 'SUCCESS',
              message: `tags=${extractedMetadata.tags.length}`,
            }),
          };
        } catch (error: unknown) {
          const { message, stack } = formatProcessingError(error);

          this.logger.warn(
            `[Reel ${state.reelId}] Metadata extraction failed, fallback to user metadata: ${message}`,
            stack,
          );

          return {
            extractedMetadata: {
              tags: [],
            },
            trace: this.appendTrace(state, {
              node: 'metadataExtractionNode',
              status: 'FALLBACK',
              message,
            }),
          };
        }
      });
    };
  }

  private createNormalizationNode(nodeTimings: Record<string, number>) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('normalizationNode', nodeTimings, () => {
        const normalizedMetadata = this.normalizeReelMetadataUseCase.execute({
          userTitle: state.title,
          userDescription: state.description,
          userTags: state.tags,
          extractedMetadata: state.extractedMetadata,
        });

        return {
          normalizedMetadata,
          trace: this.appendTrace(state, {
            node: 'normalizationNode',
            status: 'SUCCESS',
            message: `title=${Boolean(
              normalizedMetadata.title,
            )} tags=${normalizedMetadata.tags.length}`,
          }),
        };
      });
    };
  }

  private createChunkingNode(
    nodeTimings: Record<string, number>,
    metricsContext: ReelPipelineMetricContext,
  ) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('chunkingNode', nodeTimings, async () => {
        const metadata = state.normalizedMetadata;

        const timer = this.processingMetrics.startStage(
          metricsContext,
          'CHUNKING',
        );
        const result =
          await this.buildTranscriptChunksUseCase.executeWithMetrics({
            title: metadata?.title,
            description: metadata?.description,
            tags: metadata?.tags,
            transcript: state.transcript,
            transcriptSegments: state.transcriptSegments,
          });
        const builtChunks = result.chunks;
        timer.succeed({
          semanticUnitCount: result.metrics.semanticUnitCount,
          finalChunkCount: result.metrics.finalChunkCount,
          embeddingRequestCount: result.metrics.semanticEmbeddingRequestCount,
          embeddingTotalItemCount: result.metrics.semanticEmbeddingRequestCount,
        });

        return {
          builtChunks,
          chunkBuildMetrics: result.metrics,
          trace: this.appendTrace(state, {
            node: 'chunkingNode',
            status: builtChunks.length > 0 ? 'SUCCESS' : 'FALLBACK',
            message: `builtChunks=${builtChunks.length}`,
          }),
        };
      });
    };
  }

  private createEmbeddingNode(
    nodeTimings: Record<string, number>,
    metricsContext: ReelPipelineMetricContext,
  ) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('embeddingNode', nodeTimings, async () => {
        const metadata = state.normalizedMetadata;

        const result = await this.withRetry(
          'embeddingNode',
          2,
          async (attempt) => {
            const retryNumber = attempt - 1;
            const timer = this.processingMetrics.startStage(
              metricsContext,
              'EMBEDDING',
              { retryNumber },
            );

            try {
              const embeddingResult =
                await this.embedReelChunksUseCase.executeWithMetrics({
                  reelId: state.reelId,
                  title: metadata?.title,
                  description: metadata?.description,
                  tags: metadata?.tags,
                  chunks: state.builtChunks,
                });
              timer.succeed({
                retryNumber,
                embeddingRequestCount: embeddingResult.metrics.requestCount,
                embeddingTotalItemCount: embeddingResult.metrics.totalItemCount,
                embeddingFailedRequestCount:
                  embeddingResult.metrics.failedRequestCount,
              });
              return embeddingResult;
            } catch (error: unknown) {
              timer.fail('EMBEDDING', { retryNumber });
              throw error;
            }
          },
        );
        const indexedChunks = result.chunks;

        return {
          indexedChunks,
          chunkEmbeddingMetrics: result.metrics,
          trace: this.appendTrace(state, {
            node: 'embeddingNode',
            status: indexedChunks.length > 0 ? 'SUCCESS' : 'FALLBACK',
            message: `indexedChunks=${indexedChunks.length}`,
          }),
        };
      });
    };
  }

  private createValidationNode(nodeTimings: Record<string, number>) {
    return async (
      state: ReelIndexingWorkflowState,
    ): Promise<Partial<ReelIndexingWorkflowState>> => {
      return this.timed('validationNode', nodeTimings, () => {
        const metadata = state.normalizedMetadata;

        const validation = this.validateReelIndexUseCase.execute({
          title: metadata?.title,
          description: metadata?.description,
          tags: metadata?.tags,
          transcript: state.transcript,
          chunks: state.indexedChunks,
        });

        if (!validation.valid) {
          this.logger.warn(
            `[Reel ${state.reelId}] Index validation warnings: ${validation.warnings.join(
              '; ',
            )}`,
          );
        }

        return {
          validation,
          trace: this.appendTrace(state, {
            node: 'validationNode',
            status: validation.valid ? 'SUCCESS' : 'FALLBACK',
            message: validation.warnings.join('; ') || 'valid',
          }),
        };
      });
    };
  }

  private appendTrace(
    state: ReelIndexingWorkflowState,
    step: ReelIndexingWorkflowTraceStep,
  ): ReelIndexingWorkflowTraceStep[] {
    return [...(state.trace ?? []), step];
  }

  private async timed<T>(
    label: string,
    nodeTimings: Record<string, number>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      return await fn();
    } finally {
      const duration = Date.now() - startedAt;
      nodeTimings[label] = duration;
      this.logger.debug(`[ReelIndexGraphTiming] ${label}=${duration}ms`);
    }
  }

  private async withRetry<T>(
    label: string,
    attempts: number,
    fn: (attempt: number) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (error: unknown) {
        lastError = error;

        const message = error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `[ReelIndexGraph] ${label} attempt ${attempt}/${attempts} failed: ${message}`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed after ${attempts} attempts`);
  }

  private toWorkflowState(
    value: unknown,
    fallback: ReelIndexingWorkflowState,
  ): ReelIndexingWorkflowState {
    if (!this.isRecord(value)) {
      return fallback;
    }

    const normalizedMetadata = this.toNormalizedMetadata(
      value['normalizedMetadata'],
    );

    return {
      reelId: this.toStringOrFallback(value['reelId'], fallback.reelId),
      title: this.toOptionalString(value['title']),
      description: this.toOptionalString(value['description']),
      tags: this.toOptionalStringArray(value['tags']),
      inputPath: this.toStringOrFallback(
        value['inputPath'],
        fallback.inputPath,
      ),
      audioPath: this.toStringOrFallback(
        value['audioPath'],
        fallback.audioPath,
      ),

      transcription: this.toTranscriptionResult(value['transcription']),
      transcript: this.toOptionalString(value['transcript']),
      transcriptVtt: this.toOptionalString(value['transcriptVtt']),
      transcriptSegments: this.toTranscriptSegments(
        value['transcriptSegments'],
      ),

      extractedMetadata: this.toExtractedMetadata(value['extractedMetadata']),
      normalizedMetadata,

      builtChunks: this.toBuiltChunks(value['builtChunks']),
      indexedChunks: this.toIndexedChunks(value['indexedChunks']),

      validation: this.toValidationResult(value['validation']),
      chunkBuildMetrics: this.toChunkBuildMetrics(value['chunkBuildMetrics']),
      chunkEmbeddingMetrics: this.toChunkEmbeddingMetrics(
        value['chunkEmbeddingMetrics'],
      ),
      trace: this.toTraceSteps(value['trace']),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toTranscriptionResult(
    value: unknown,
  ): TranscriptionResult | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const text = this.toOptionalString(value['text']);

    if (!text) {
      return undefined;
    }

    const result: TranscriptionResult = {
      text,
    };

    const vtt = this.toOptionalString(value['vtt']);

    if (vtt) {
      result.vtt = vtt;
    }

    const segments = this.toTranscriptSegments(value['segments']);

    if (segments) {
      result.segments = segments;
    }

    const wordCount = Number(value['wordCount']);

    if (Number.isFinite(wordCount)) {
      result.wordCount = wordCount;
    }

    return result;
  }

  private toStringOrFallback(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : fallback;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private toOptionalStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const items = value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );

    return items.length > 0 ? items : undefined;
  }

  private toExtractedMetadata(
    value: unknown,
  ): ExtractedReelMetadata | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return {
      title: this.toOptionalString(value['title']),
      description: this.toOptionalString(value['description']),
      tags: this.toOptionalStringArray(value['tags']) ?? [],
    };
  }

  private toNormalizedMetadata(
    value: unknown,
  ): NormalizedReelMetadata | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return {
      title: this.toOptionalString(value['title']),
      description: this.toOptionalString(value['description']),
      tags: this.toOptionalStringArray(value['tags']) ?? [],
    };
  }

  private toTranscriptSegments(
    value: unknown,
  ): TranscriptSegment[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const segments = value.filter(
      (item): item is TranscriptSegment =>
        this.isRecord(item) &&
        typeof item['text'] === 'string' &&
        Number.isFinite(Number(item['start'])) &&
        Number.isFinite(Number(item['end'])),
    );

    return segments.length > 0 ? segments : undefined;
  }

  private toBuiltChunks(value: unknown): BuiltTranscriptChunk[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is BuiltTranscriptChunk =>
        this.isRecord(item) &&
        (item['type'] === 'metadata' || item['type'] === 'transcript') &&
        typeof item['text'] === 'string' &&
        item['text'].trim().length > 0,
    );
  }

  private toIndexedChunks(value: unknown): ReelChunkIndexInput[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is ReelChunkIndexInput =>
        this.isRecord(item) &&
        Number.isInteger(item['chunkIndex']) &&
        typeof item['text'] === 'string' &&
        item['text'].trim().length > 0 &&
        Array.isArray(item['embedding']) &&
        typeof item['embeddingModel'] === 'string',
    );
  }

  private toValidationResult(
    value: unknown,
  ): ReelIndexValidationResult | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return {
      valid: value['valid'] === true,
      warnings: this.toOptionalStringArray(value['warnings']) ?? [],
    };
  }

  private toChunkBuildMetrics(
    value: unknown,
  ): TranscriptChunkBuildMetrics | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return {
      semanticUnitCount: Number(value['semanticUnitCount']) || 0,
      semanticEmbeddingRequestCount:
        Number(value['semanticEmbeddingRequestCount']) || 0,
      finalChunkCount: Number(value['finalChunkCount']) || 0,
    };
  }

  private toChunkEmbeddingMetrics(
    value: unknown,
  ): ReelChunkEmbeddingMetrics | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return {
      requestCount: Number(value['requestCount']) || 0,
      totalItemCount: Number(value['totalItemCount']) || 0,
      failedRequestCount: Number(value['failedRequestCount']) || 0,
    };
  }

  private toTraceSteps(value: unknown): ReelIndexingWorkflowTraceStep[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is ReelIndexingWorkflowTraceStep =>
        this.isRecord(item) &&
        typeof item['node'] === 'string' &&
        (item['status'] === 'SUCCESS' ||
          item['status'] === 'FALLBACK' ||
          item['status'] === 'FAILED'),
    );
  }
}
