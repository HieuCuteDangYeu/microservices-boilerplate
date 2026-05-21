import { z } from 'zod';
import { MessageMediaSchema } from '../../conversation/dtos/message-media.schema';

export const CompletedVideoProcessingSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  fileKey: z.string().min(1, 'File key is required'),
  media: MessageMediaSchema.extend({
    fileKey: z.string().min(1),
    fileUrl: z.string().min(1),
    status: z.literal('ready'),
  }),
});

export const FailedVideoProcessingSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  fileKey: z.string().min(1, 'File key is required'),
  media: MessageMediaSchema.extend({
    fileKey: z.string().min(1),
    fileUrl: z.string().min(1),
    status: z.literal('failed'),
    failureReason: z.string().min(1),
  }),
});

export type CompletedVideoProcessingPayload = z.infer<
  typeof CompletedVideoProcessingSchema
>;
export type FailedVideoProcessingPayload = z.infer<
  typeof FailedVideoProcessingSchema
>;
