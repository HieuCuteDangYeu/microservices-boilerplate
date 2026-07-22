import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ExtractHierarchicalMetadataUseCase {
  constructor(
    @Inject('IIndexingAiService') private readonly ai: IIndexingAiService,
  ) {}

  async execute(
    job: ReelIndexJob,
    transcript: string | undefined,
    sections: TranscriptSection[],
  ): Promise<{
    metadata: ExtractedReelMetadata;
    sections: TranscriptSection[];
  }> {
    if (this.hasStrongUserMetadata(job)) {
      return {
        metadata: this.userMetadata(job),
        sections,
      };
    }

    if (!transcript?.trim()) {
      return {
        metadata: this.userMetadata(job),
        sections,
      };
    }

    if (sections.length <= 1 && transcript.length <= 6_000) {
      return {
        metadata: this.withUserFallbacks(
          job,
          await this.ai.extractReelMetadata({
            title: job.title,
            description: job.description,
            tags: job.tags,
            transcript,
          }),
        ),
        sections,
      };
    }

    const summarized = await Promise.all(
      sections.map(async (section) => {
        const metadata = await this.ai.extractReelMetadata({
          title: job.title,
          tags: job.tags,
          transcript: section.text.slice(0, 6_000),
          maxTags: 5,
        });
        const summary =
          metadata.description?.trim() ||
          metadata.title?.trim() ||
          section.text.slice(0, 500);
        return { ...section, summary };
      }),
    );
    const rollup = summarized
      .map((section) => `Section ${section.index + 1}: ${section.summary}`)
      .join('\n')
      .slice(0, 6_000);

    return {
      metadata: this.withUserFallbacks(
        job,
        await this.ai.extractReelMetadata({
          title: job.title,
          description: job.description,
          tags: job.tags,
          transcript: rollup,
        }),
      ),
      sections: summarized,
    };
  }

  private hasStrongUserMetadata(job: ReelIndexJob): boolean {
    return Boolean(
      (job.title?.trim().length ?? 0) >= 8 &&
      (job.description?.trim().length ?? 0) >= 40 &&
      job.tags.filter((tag) => tag.trim().length > 0).length >= 3,
    );
  }

  private userMetadata(job: ReelIndexJob): ExtractedReelMetadata {
    return {
      title: job.title?.trim() || undefined,
      description: job.description?.trim() || undefined,
      tags: [...new Set(job.tags.map((tag) => tag.trim()).filter(Boolean))],
    };
  }

  private withUserFallbacks(
    job: ReelIndexJob,
    extracted: ExtractedReelMetadata,
  ): ExtractedReelMetadata {
    return {
      title: extracted.title?.trim() || job.title?.trim() || undefined,
      description:
        extracted.description?.trim() || job.description?.trim() || undefined,
      tags: [
        ...new Set(
          [...job.tags, ...extracted.tags]
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ],
    };
  }
}
