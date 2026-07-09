import { z } from 'zod';

export const AiRecommendedReelAuthorSchema = z.object({
  id: z.string(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
});

export const AiRecommendedReelSchema = z.object({
  id: z.string(),
  userId: z.string(),
  mediaKey: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  visibility: z.enum(['public', 'private']),
  viewCount: z.number().default(0),
  thumbnailKey: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  streamUrl: z.string().optional(),
  createdAt: z.string(),
  author: AiRecommendedReelAuthorSchema.optional(),
});

export const AskQuestionResponseSchema = z.object({
  answer: z.string().optional(),
  recommendedReels: z.array(AiRecommendedReelSchema).optional(),
  suggestedQueries: z.array(z.string()).optional(),
  error: z
    .object({
      code: z.enum(['AI_UNAVAILABLE', 'NO_CONTENT', 'UNKNOWN']),
      message: z.string(),
    })
    .optional(),
});

export type AskQuestionResponse = z.infer<typeof AskQuestionResponseSchema>;
export type AiRecommendedReel = z.infer<typeof AiRecommendedReelSchema>;
