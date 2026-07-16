import type { Reel } from '@content/domain/entities/reel.entity';
import type {
  CandidateSourceInput,
  RecommendationCandidateEvidence,
} from '@content/domain/interfaces/recommendation-candidate.interface';
import type { IRecommendationCandidateRepository } from '@content/domain/interfaces/recommendation-candidate.repository.interface';
import { ContentRepository } from '@content/infrastructure/repositories/content.repository';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/content-client';

const RECOMMENDATION_REEL_SELECT = {
  id: true,
  userId: true,
  mediaKey: true,
  title: true,
  description: true,
  tags: true,
  status: true,
  visibility: true,
  viewCount: true,
  thumbnailKey: true,
  processingStage: true,
  processingMessage: true,
  processingProgress: true,
  processingAttemptId: true,
  processingStartedAt: true,
  processingFailedAt: true,
  processingCompletedAt: true,
  processingErrorCode: true,
  processingErrorDetail: true,
  sourceDurationMs: true,
  sourceWidth: true,
  sourceHeight: true,
  sourceFps: true,
  sourceBitrateKbps: true,
  sourceHasAudio: true,
  sourceRotation: true,
  encodedVariantCount: true,
  encodedMaxHeight: true,
  encodedFps: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ReelSelect;

type RecommendationReelRecord = Prisma.ReelGetPayload<{
  select: typeof RECOMMENDATION_REEL_SELECT;
}>;

interface PositiveProfile {
  tagWeights: Map<string, number>;
  rawTagByNormalizedTag: Map<string, string>;
  creatorWeights: Map<string, number>;
}

@Injectable()
export class RecommendationCandidateRepository implements IRecommendationCandidateRepository {
  constructor(private readonly contentRepository: ContentRepository) {}

  async findRecentQualityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [
          this.buildBaseWhere(input),
          { createdAt: { gte: since } },
          {
            OR: [
              { encodedVariantCount: { gte: 1 } },
              { thumbnailKey: { not: null } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }],
      take: input.limit,
      select: RECOMMENDATION_REEL_SELECT,
    });

    return records.map((record) => {
      const freshness = 1 / (1 + this.ageHours(record.createdAt) / 72);
      const quality = this.mediaQualityScore(record);
      const popularity = this.popularityScore(record.viewCount);
      return {
        reelId: record.id,
        source: 'RECENT_QUALITY',
        sourceScore: this.clamp(
          freshness * 0.6 + quality * 0.3 + popularity * 0.1,
        ),
        reasons: [
          'recent completed public reel',
          quality >= 0.7
            ? 'strong processing metadata'
            : 'acceptable processing metadata',
        ],
      };
    });
  }

  async findTrendingCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await this.contentRepository.reelViewEvent.findMany({
      where: {
        occurredAt: { gte: since },
        OR: [
          {
            eventType: {
              in: [
                'IMPRESSION',
                'WATCH_START',
                'WATCH_PROGRESS',
                'WATCH_END',
                'SKIP',
                'COMPLETE',
                'REPLAY',
              ],
            },
          },
          { completed: true },
          { replayed: true },
          { skipped: true },
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 10_000,
      select: {
        reelId: true,
        eventType: true,
        watchMs: true,
        percentageWatched: true,
        completed: true,
        replayed: true,
        skipped: true,
      },
    });

    const scoreByReelId = new Map<string, number>();
    for (const event of events) {
      scoreByReelId.set(
        event.reelId,
        (scoreByReelId.get(event.reelId) ?? 0) +
          this.trendingEventWeight(event),
      );
    }

    const rankedIds = [...scoreByReelId.entries()]
      .filter(([, score]) => score > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, Math.max(input.limit * 3, input.limit))
      .map(([reelId]) => reelId);
    if (rankedIds.length === 0) return [];

    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [this.buildBaseWhere(input), { id: { in: rankedIds } }],
      },
      select: RECOMMENDATION_REEL_SELECT,
    });
    const maxScore = Math.max(
      1,
      ...records.map((record) => scoreByReelId.get(record.id) ?? 0),
    );

    return records
      .map((record) => ({
        reelId: record.id,
        source: 'TRENDING' as const,
        sourceScore: this.clamp((scoreByReelId.get(record.id) ?? 0) / maxScore),
        reasons: ['strong seven-day watch and completion signals'],
      }))
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, input.limit);
  }

  async findTagAffinityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const profile = await this.loadPositiveProfile(input.viewerId, 60);
    const topTags = this.topWeightedKeys(profile.tagWeights, 12);
    const queryTags = topTags
      .map((tag) => profile.rawTagByNormalizedTag.get(tag))
      .filter((tag): tag is string => Boolean(tag));
    if (queryTags.length === 0) return [];

    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [this.buildBaseWhere(input), { tags: { hasSome: queryTags } }],
      },
      orderBy: [{ createdAt: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }],
      take: Math.max(input.limit * 2, input.limit),
      select: RECOMMENDATION_REEL_SELECT,
    });
    const maxWeight = Math.max(
      1,
      ...topTags.map((tag) => profile.tagWeights.get(tag) ?? 0),
    );

    return records
      .map((record) => {
        const matchingTags = record.tags
          .map((tag) => this.normalizeTag(tag))
          .filter((tag) => profile.tagWeights.has(tag));
        const affinity = matchingTags.reduce(
          (sum, tag) => sum + (profile.tagWeights.get(tag) ?? 0),
          0,
        );
        return {
          reelId: record.id,
          source: 'TAG_AFFINITY' as const,
          sourceScore: this.clamp(
            affinity / (maxWeight * Math.max(1, matchingTags.length)),
          ),
          reasons: matchingTags.length
            ? [`matches watched tags: ${matchingTags.slice(0, 3).join(', ')}`]
            : ['matches viewer tag affinity'],
        };
      })
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, input.limit);
  }

  async findCreatorAffinityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const profile = await this.loadPositiveProfile(input.viewerId, 60);
    const creatorIds = this.topWeightedKeys(profile.creatorWeights, 20);
    if (creatorIds.length === 0) return [];

    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [this.buildBaseWhere(input), { userId: { in: creatorIds } }],
      },
      orderBy: [{ createdAt: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }],
      take: Math.max(input.limit * 2, input.limit),
      select: RECOMMENDATION_REEL_SELECT,
    });
    const maxWeight = Math.max(
      1,
      ...creatorIds.map(
        (creatorId) => profile.creatorWeights.get(creatorId) ?? 0,
      ),
    );

    return records
      .map((record) => ({
        reelId: record.id,
        source: 'CREATOR_AFFINITY' as const,
        sourceScore: this.clamp(
          (profile.creatorWeights.get(record.userId) ?? 0) / maxWeight,
        ),
        reasons: ['creator previously produced positively watched reels'],
      }))
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, input.limit);
  }

  async findContentSimilarityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const seedEvents = await this.contentRepository.reelViewEvent.findMany({
      where: {
        userId: input.viewerId,
        occurredAt: {
          gte: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        },
        OR: [
          { eventType: { in: ['COMPLETE', 'REPLAY'] } },
          { completed: true },
          { replayed: true },
          { percentageWatched: { gte: 80 } },
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 40,
      select: {
        reel: { select: { id: true, tags: true } },
      },
    });

    const seedReelIds = new Set<string>();
    const tagWeights = new Map<string, number>();
    const rawTagByNormalizedTag = new Map<string, string>();
    for (let index = 0; index < seedEvents.length; index += 1) {
      const reel = seedEvents[index].reel;
      if (!reel) continue;
      seedReelIds.add(reel.id);
      const recencyWeight = 1 / (1 + index / 8);
      for (const rawTag of reel.tags) {
        const tag = this.normalizeTag(rawTag);
        if (!tag) continue;
        rawTagByNormalizedTag.set(tag, rawTag);
        tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + recencyWeight);
      }
    }

    const topTags = this.topWeightedKeys(tagWeights, 15);
    const queryTags = topTags
      .map((tag) => rawTagByNormalizedTag.get(tag))
      .filter((tag): tag is string => Boolean(tag));
    if (queryTags.length === 0) return [];

    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [
          this.buildBaseWhere(input),
          { id: { notIn: [...seedReelIds] } },
          { tags: { hasSome: queryTags } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }],
      take: Math.max(input.limit * 2, input.limit),
      select: RECOMMENDATION_REEL_SELECT,
    });
    const maxWeight = Math.max(
      1,
      ...topTags.map((tag) => tagWeights.get(tag) ?? 0),
    );

    return records
      .map((record) => {
        const matchingTags = record.tags
          .map((tag) => this.normalizeTag(tag))
          .filter((tag) => tagWeights.has(tag));
        const similarity = matchingTags.reduce(
          (sum, tag) => sum + (tagWeights.get(tag) ?? 0),
          0,
        );
        return {
          reelId: record.id,
          source: 'CONTENT_SIMILARITY' as const,
          sourceScore: this.clamp(
            similarity / (maxWeight * Math.max(1, matchingTags.length)),
          ),
          reasons: matchingTags.length
            ? [
                `metadata similarity to completed reels: ${matchingTags
                  .slice(0, 3)
                  .join(', ')}`,
              ]
            : ['metadata similarity to completed reels'],
        };
      })
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, input.limit);
  }

  async findSocialCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const excludedSet = new Set(input.excludedUserIds);
    const friendUserIds = [
      ...new Set(
        input.friendUserIds.filter(
          (friendUserId) => !excludedSet.has(friendUserId),
        ),
      ),
    ];
    if (friendUserIds.length === 0) return [];

    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [this.buildBaseWhere(input), { userId: { in: friendUserIds } }],
      },
      orderBy: [{ createdAt: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }],
      take: input.limit,
      select: RECOMMENDATION_REEL_SELECT,
    });

    return records.map((record) => ({
      reelId: record.id,
      source: 'SOCIAL',
      sourceScore: this.clamp(
        0.65 * (1 / (1 + this.ageHours(record.createdAt) / 96)) +
          0.35 * this.popularityScore(record.viewCount),
      ),
      reasons: ['public reel from an accepted friend'],
    }));
  }

  async findExplorationCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    const profile = await this.loadPositiveProfile(input.viewerId, 90);
    const knownCreatorIds = this.topWeightedKeys(profile.creatorWeights, 100);
    const records = await this.contentRepository.reel.findMany({
      where: {
        AND: [
          this.buildBaseWhere(input),
          ...(knownCreatorIds.length > 0
            ? [
                {
                  userId: { notIn: knownCreatorIds },
                } satisfies Prisma.ReelWhereInput,
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: Math.max(input.limit * 5, input.limit),
      select: RECOMMENDATION_REEL_SELECT,
    });

    return records
      .map((record) => ({
        reelId: record.id,
        source: 'EXPLORATION' as const,
        sourceScore: this.clamp(
          0.55 * this.stableNoise(record.id, input.viewerId) +
            0.3 * (1 / (1 + this.ageHours(record.createdAt) / 120)) +
            0.15 * this.mediaQualityScore(record),
        ),
        reasons: ['controlled exploration from an unfamiliar creator'],
      }))
      .sort((left, right) => right.sourceScore - left.sourceScore)
      .slice(0, input.limit);
  }

  async findRecentlySeenReelIds(
    viewerId: string,
    since: Date,
  ): Promise<Set<string>> {
    const events = await this.contentRepository.reelViewEvent.findMany({
      where: {
        userId: viewerId,
        occurredAt: { gte: since },
        eventType: {
          in: [
            'IMPRESSION',
            'WATCH_START',
            'WATCH_PROGRESS',
            'WATCH_END',
            'COMPLETE',
            'REPLAY',
            'SKIP',
          ],
        },
      },
      distinct: ['reelId'],
      select: { reelId: true },
    });
    return new Set(events.map((event) => event.reelId));
  }

  async findEligibleReelsByIds(
    reelIds: string[],
    excludedUserIds: string[],
  ): Promise<Reel[]> {
    if (reelIds.length === 0) return [];
    const records = await this.contentRepository.reel.findMany({
      where: {
        id: { in: reelIds },
        status: 'COMPLETED',
        visibility: 'public',
        ...(excludedUserIds.length > 0
          ? { userId: { notIn: excludedUserIds } }
          : {}),
      },
      select: RECOMMENDATION_REEL_SELECT,
    });
    return records.map((record) => this.toDomain(record));
  }

  private buildBaseWhere(input: CandidateSourceInput): Prisma.ReelWhereInput {
    return {
      status: 'COMPLETED',
      visibility: 'public',
      ...(input.excludedUserIds.length > 0
        ? { userId: { notIn: input.excludedUserIds } }
        : {}),
      ...(input.cursor
        ? {
            OR: [
              { createdAt: { lt: input.cursor.createdAt } },
              {
                createdAt: input.cursor.createdAt,
                id: { gt: input.cursor.id },
              },
            ],
          }
        : {}),
    };
  }

  private async loadPositiveProfile(
    viewerId: string,
    days: number,
  ): Promise<PositiveProfile> {
    const events = await this.contentRepository.reelViewEvent.findMany({
      where: {
        userId: viewerId,
        occurredAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
        OR: [
          { eventType: { in: ['WATCH_END', 'COMPLETE', 'REPLAY'] } },
          { completed: true },
          { replayed: true },
          { percentageWatched: { gte: 70 } },
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 600,
      select: {
        eventType: true,
        percentageWatched: true,
        completed: true,
        replayed: true,
        skipped: true,
        reel: { select: { userId: true, tags: true } },
      },
    });

    const tagWeights = new Map<string, number>();
    const rawTagByNormalizedTag = new Map<string, string>();
    const creatorWeights = new Map<string, number>();
    for (const event of events) {
      const reel = event.reel;
      if (!reel) continue;
      const weight = this.positiveEventWeight(event);
      if (weight <= 0) continue;

      creatorWeights.set(
        reel.userId,
        (creatorWeights.get(reel.userId) ?? 0) + weight,
      );
      for (const rawTag of reel.tags) {
        const tag = this.normalizeTag(rawTag);
        if (!tag) continue;
        rawTagByNormalizedTag.set(tag, rawTag);
        tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight);
      }
    }
    return { tagWeights, rawTagByNormalizedTag, creatorWeights };
  }

  private positiveEventWeight(event: {
    eventType: string;
    percentageWatched: number | null;
    completed: boolean;
    replayed: boolean;
    skipped: boolean;
  }): number {
    if (event.skipped) return 0;
    if (event.replayed || event.eventType === 'REPLAY') return 1.6;
    if (event.completed || event.eventType === 'COMPLETE') return 1.3;
    if ((event.percentageWatched ?? 0) >= 90) return 1.1;
    if ((event.percentageWatched ?? 0) >= 70) return 0.8;
    return event.eventType === 'WATCH_END' ? 0.5 : 0;
  }

  private trendingEventWeight(event: {
    eventType: string;
    watchMs: number;
    percentageWatched: number | null;
    completed: boolean;
    replayed: boolean;
    skipped: boolean;
  }): number {
    let score = 0;
    switch (event.eventType) {
      case 'IMPRESSION':
        score += 0.03;
        break;
      case 'WATCH_START':
        score += 0.08;
        break;
      case 'WATCH_PROGRESS':
        score += Math.min((event.percentageWatched ?? 0) / 250, 0.4);
        break;
      case 'WATCH_END':
        score += Math.min((event.percentageWatched ?? 0) / 100, 1);
        break;
      case 'COMPLETE':
        score += 1.5;
        break;
      case 'REPLAY':
        score += 2;
        break;
      case 'SKIP':
        score -= 1.1;
        break;
      default:
        break;
    }
    if (event.completed) score += 1;
    if (event.replayed) score += 1.2;
    if (event.skipped) score -= 0.8;
    score += Math.min(event.watchMs / 120_000, 0.5);
    return score;
  }

  private mediaQualityScore(record: RecommendationReelRecord): number {
    let score = 0;
    if ((record.encodedVariantCount ?? 0) >= 1) score += 0.25;
    if ((record.encodedVariantCount ?? 0) >= 3) score += 0.1;
    if (record.thumbnailKey) score += 0.15;
    if ((record.sourceDurationMs ?? 0) >= 1_000) score += 0.1;
    if ((record.encodedMaxHeight ?? 0) >= 720) score += 0.2;
    if ((record.encodedFps ?? 0) >= 24) score += 0.1;
    if (record.sourceHasAudio === true) score += 0.1;
    return this.clamp(score);
  }

  private popularityScore(viewCount: bigint): number {
    return this.clamp(Math.log(Number(viewCount ?? 0) + 1) / Math.log(5_000));
  }

  private ageHours(createdAt: Date): number {
    return Math.max(0, (Date.now() - createdAt.getTime()) / 3_600_000);
  }

  private normalizeTag(rawTag: string): string {
    return rawTag.normalize('NFKC').trim().replace(/^#+/, '').toLowerCase();
  }

  private topWeightedKeys(
    weights: Map<string, number>,
    limit: number,
  ): string[] {
    return [...weights.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([key]) => key);
  }

  private stableNoise(reelId: string, viewerId: string): number {
    const value = `${viewerId}:${reelId}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4_294_967_295;
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 1);
  }

  private toDomain(record: RecommendationReelRecord): Reel {
    return {
      id: record.id,
      userId: record.userId,
      mediaKey: record.mediaKey,
      title: record.title ?? undefined,
      description: record.description ?? undefined,
      tags: record.tags ?? [],
      status: record.status,
      visibility: record.visibility as Reel['visibility'],
      viewCount: record.viewCount,
      thumbnailKey: record.thumbnailKey ?? undefined,
      processingStage: record.processingStage ?? undefined,
      processingMessage: record.processingMessage ?? undefined,
      processingProgress: record.processingProgress ?? undefined,
      processingAttemptId: record.processingAttemptId ?? undefined,
      processingStartedAt: record.processingStartedAt ?? undefined,
      processingFailedAt: record.processingFailedAt ?? undefined,
      processingCompletedAt: record.processingCompletedAt ?? undefined,
      processingErrorCode: record.processingErrorCode ?? undefined,
      processingErrorDetail: record.processingErrorDetail ?? undefined,
      sourceDurationMs: record.sourceDurationMs ?? undefined,
      sourceWidth: record.sourceWidth ?? undefined,
      sourceHeight: record.sourceHeight ?? undefined,
      sourceFps: record.sourceFps ?? undefined,
      sourceBitrateKbps: record.sourceBitrateKbps ?? undefined,
      sourceHasAudio: record.sourceHasAudio ?? undefined,
      sourceRotation: record.sourceRotation ?? undefined,
      encodedVariantCount: record.encodedVariantCount ?? undefined,
      encodedMaxHeight: record.encodedMaxHeight ?? undefined,
      encodedFps: record.encodedFps ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
