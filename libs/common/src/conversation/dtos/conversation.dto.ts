import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ConversationParticipantSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  fullName: z.string().optional(),
  avatar: z.string().optional(),
  picture: z.string().optional(),
  email: z.string().optional(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  creatorId: z.string().optional(),
  participantIds: z.array(z.string()),
  participants: z.array(ConversationParticipantSchema).optional(),
  name: z.string().optional().nullable(),
  picture: z.string().optional().nullable(),
  memberJoinedAt: z.record(z.string(), z.string()).optional(),
  lastMessage: z.string().optional().nullable(),
  lastMessageAt: z.string().datetime().optional().nullable(),
  isGroup: z.boolean(),
  unreadCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});

export class ConversationDto extends createZodDto(ConversationSchema) {}
