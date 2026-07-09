import { z } from 'zod';

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
  streamUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  createdAt: z.string(),
  author: z
    .object({
      id: z.string(),
      username: z.string().nullable(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      isVerified: z.boolean().nullable(),
    })
    .optional(),
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
