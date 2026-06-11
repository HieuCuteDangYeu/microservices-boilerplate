import { z } from 'zod';

export const MessageMediaStatusSchema = z.enum([
  'ready',
  'processing',
  'failed',
]);

export const MessageMediaSchema = z.object({
  fileKey: z.string().min(1).optional(),
  fileUrl: z.string().min(1),
  thumbnailKey: z.string().min(1).optional(),
  thumbnailUrl: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  status: MessageMediaStatusSchema.optional(),
  failureReason: z.string().min(1).optional(),
  reelId: z.string().min(1).optional(),
  reelOwnerId: z.string().min(1).optional(),
  reelOwnerUsername: z.string().min(1).optional(),
  reelOwnerAvatarUrl: z.string().min(1).optional(),
  reelTitle: z.string().min(1).optional(),
  reelDescription: z.string().min(1).optional(),
});

export type MessageMediaDto = z.infer<typeof MessageMediaSchema>;
export type MessageMediaStatusDto = z.infer<typeof MessageMediaStatusSchema>;
