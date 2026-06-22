import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { BuiltTranscriptChunk } from '@common/conversation/interfaces/built-transcript-chunk.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';

interface SemanticUnit {
  text: string;
  startTime?: number;
  endTime?: number;
  embedding?: number[];
}

@Injectable()
export class BuildTranscriptChunksUseCase {
  private readonly logger = new Logger(BuildTranscriptChunksUseCase.name);

  private readonly defaultTags: string[] = [];
  private readonly softMaxChunkChars = 1200;
  private readonly hardMaxChunkChars = 1800;
  private readonly minChunkChars = 350;
  private readonly minSemanticUnitChars = 180;
  private readonly overlapUnits = 1;
  private readonly semanticBreakThreshold = 0.72;

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
  ) {}

  async execute(data: {
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<BuiltTranscriptChunk[]> {
    const chunks: BuiltTranscriptChunk[] = [];

    const metadataChunk = this.buildMetadataChunk(data);

    if (metadataChunk) {
      chunks.push(metadataChunk);
    }

    let transcriptChunks = await this.buildSemanticChunksFromSegments(
      data.transcriptSegments,
    );

    if (transcriptChunks.length === 0) {
      transcriptChunks = await this.buildSemanticChunksFromTranscript(
        data.transcript,
      );
    }

    chunks.push(...transcriptChunks);

    return chunks;
  }

  private async buildSemanticChunksFromSegments(
    segments?: TranscriptSegment[],
  ): Promise<BuiltTranscriptChunk[]> {
    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    const units: SemanticUnit[] = [];

    for (const segment of segments) {
      const text = segment.text?.trim();

      if (!text) {
        continue;
      }

      const start = Number(segment.start);
      const end = Number(segment.end);

      const unit: SemanticUnit = { text };

      if (Number.isFinite(start)) {
        unit.startTime = start;
      }

      if (Number.isFinite(end)) {
        unit.endTime = end;
      }

      units.push(unit);
    }

    if (units.length === 0) {
      return [];
    }

    return this.buildSemanticTranscriptChunks(this.mergeSmallUnits(units));
  }

  private async buildSemanticChunksFromTranscript(
    transcript?: string,
  ): Promise<BuiltTranscriptChunk[]> {
    const text = transcript?.trim();

    if (!text) {
      return [];
    }

    const sentences = this.splitIntoSentences(text);

    if (sentences.length === 0) {
      return [{ type: 'transcript', text }];
    }

    return this.buildSemanticTranscriptChunks(
      this.mergeSmallUnits(sentences.map((sentence) => ({ text: sentence }))),
    );
  }

  private async buildSemanticTranscriptChunks(
    units: SemanticUnit[],
  ): Promise<BuiltTranscriptChunk[]> {
    try {
      const embeddedUnits = await this.embedSemanticUnits(units);

      return this.groupUnitsBySemanticSimilarity(embeddedUnits);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Semantic chunking failed, falling back to size-based chunking: ${message}`,
      );

      return this.groupUnitsBySize(units);
    }
  }

  private async embedSemanticUnits(
    units: SemanticUnit[],
  ): Promise<SemanticUnit[]> {
    const embeddedUnits: SemanticUnit[] = [];

    for (const unit of units) {
      const embedding = await this.aiService.generateEmbedding({
        text: unit.text,
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      embeddedUnits.push({
        ...unit,
        embedding: embedding.values,
      });
    }

    return embeddedUnits;
  }

  private groupUnitsBySemanticSimilarity(
    units: SemanticUnit[],
  ): BuiltTranscriptChunk[] {
    const chunks: BuiltTranscriptChunk[] = [];

    let currentUnits: SemanticUnit[] = [];
    let currentLength = 0;

    for (let index = 0; index < units.length; index++) {
      const unit = units[index];
      const previousUnit = index > 0 ? units[index - 1] : undefined;

      const similarity =
        previousUnit?.embedding && unit.embedding
          ? this.cosineSimilarity(previousUnit.embedding, unit.embedding)
          : 1;

      const nextLength = currentLength + unit.text.length + 1;

      const semanticBreak =
        currentLength >= this.minChunkChars &&
        similarity < this.semanticBreakThreshold;

      const softSizeBreak =
        currentLength >= this.minChunkChars &&
        nextLength > this.softMaxChunkChars;

      const hardSizeBreak = nextLength > this.hardMaxChunkChars;

      if (
        currentUnits.length > 0 &&
        (semanticBreak || softSizeBreak || hardSizeBreak)
      ) {
        chunks.push(this.toTranscriptChunk(currentUnits));

        const overlap = currentUnits.slice(-this.overlapUnits);
        currentUnits = [...overlap];
        currentLength = this.calculateLength(currentUnits);
      }

      currentUnits.push(unit);
      currentLength += unit.text.length + 1;
    }

    if (currentUnits.length > 0) {
      chunks.push(this.toTranscriptChunk(currentUnits));
    }

    return chunks;
  }

  private groupUnitsBySize(units: SemanticUnit[]): BuiltTranscriptChunk[] {
    const chunks: BuiltTranscriptChunk[] = [];

    let currentUnits: SemanticUnit[] = [];
    let currentLength = 0;

    for (const unit of units) {
      const nextLength = currentLength + unit.text.length + 1;

      if (currentUnits.length > 0 && nextLength > this.softMaxChunkChars) {
        chunks.push(this.toTranscriptChunk(currentUnits));

        const overlap = currentUnits.slice(-this.overlapUnits);
        currentUnits = [...overlap];
        currentLength = this.calculateLength(currentUnits);
      }

      currentUnits.push(unit);
      currentLength += unit.text.length + 1;
    }

    if (currentUnits.length > 0) {
      chunks.push(this.toTranscriptChunk(currentUnits));
    }

    return chunks;
  }

  private mergeSmallUnits(units: SemanticUnit[]): SemanticUnit[] {
    const mergedUnits: SemanticUnit[] = [];

    let currentUnits: SemanticUnit[] = [];
    let currentLength = 0;

    for (const unit of units) {
      if (
        currentUnits.length > 0 &&
        currentLength >= this.minSemanticUnitChars
      ) {
        mergedUnits.push(this.toUnit(currentUnits));
        currentUnits = [];
        currentLength = 0;
      }

      currentUnits.push(unit);
      currentLength += unit.text.length + 1;
    }

    if (currentUnits.length > 0) {
      mergedUnits.push(this.toUnit(currentUnits));
    }

    return mergedUnits;
  }

  private toTranscriptChunk(units: SemanticUnit[]): BuiltTranscriptChunk {
    const unit = this.toUnit(units);

    const chunk: BuiltTranscriptChunk = {
      type: 'transcript',
      text: unit.text,
    };

    if (Number.isFinite(unit.startTime)) {
      chunk.startTime = unit.startTime;
    }

    if (Number.isFinite(unit.endTime)) {
      chunk.endTime = unit.endTime;
    }

    return chunk;
  }

  private toUnit(units: SemanticUnit[]): SemanticUnit {
    const text = units
      .map((unit) => unit.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const startTime = units.find((unit) =>
      Number.isFinite(unit.startTime),
    )?.startTime;

    const endTime = [...units]
      .reverse()
      .find((unit) => Number.isFinite(unit.endTime))?.endTime;

    const unit: SemanticUnit = { text };

    if (Number.isFinite(startTime)) {
      unit.startTime = startTime;
    }

    if (Number.isFinite(endTime)) {
      unit.endTime = endTime;
    }

    return unit;
  }

  private buildMetadataChunk(data: {
    title?: string;
    description?: string;
    tags?: string[];
  }): BuiltTranscriptChunk | null {
    const title = data.title?.trim();
    const description = data.description?.trim();

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
    ].filter((value): value is string => Boolean(value));

    if (sections.length === 0) {
      return null;
    }

    return {
      type: 'metadata',
      text: sections.join('\n'),
    };
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?。！？])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  private calculateLength(units: SemanticUnit[]): number {
    return units.reduce((sum, unit) => sum + unit.text.length + 1, 0);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let index = 0; index < a.length; index++) {
      dotProduct += a[index] * b[index];
      magnitudeA += a[index] * a[index];
      magnitudeB += b[index] * b[index];
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
}
