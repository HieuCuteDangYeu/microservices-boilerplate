import { z } from 'zod';

export const ProcessVideoThumbnailSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  fileKey: z.string().min(1, 'File key is required'),
  thumbnailKey: z.string().min(1, 'Thumbnail key cannot be empty').optional(),
  fileType: z
    .string()
    .regex(/^(video\/(mp4|quicktime|webm))$/, 'Unsupported video file type'),
  attempt: z.number().int().nonnegative().optional().default(0),
  maxAttempts: z.number().int().positive().optional().default(3),
});

export type ProcessVideoThumbnailPayload = z.infer<
  typeof ProcessVideoThumbnailSchema
>;
